// app.js - App de tarjetas con Firebase Auth + Firestore + Storage + Lista blanca
// 🔐 Compatible con API KEY dinámica almacenada en localStorage

import { firebaseConfig as defaultConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp,
  query,
  where,
  getDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadString,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// ------------------------------------------------------------
// 🔧 1. CARGA API KEY DINÁMICA DESDE LOCALSTORAGE
// ------------------------------------------------------------
let dynamicApiKey = localStorage.getItem("firebase_api_key");

let firebaseConfig = {
  ...defaultConfig,
  apiKey: dynamicApiKey ? dynamicApiKey : defaultConfig.apiKey,
};

// ------------------------------------------------------------
// 🚀 2. INICIALIZAR FIREBASE CON LA API KEY CORRECTA
// ------------------------------------------------------------
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// ------------------------------------------------------------
// 🧠 3. ESTADOS DE LA APP
// ------------------------------------------------------------
let currentUser = null;
let isAuthorized = false;
let currentImageDataUrl = null;
let cards = [];

// ------------------------------------------------------------
// 📌 4. SELECTORES DEL DOM
// ------------------------------------------------------------
const imageInput = document.getElementById("imageInput");
const imagePreviewContainer = document.getElementById("imagePreviewContainer");
const imagePreview = document.getElementById("imagePreview");
const scanButton = document.getElementById("scanButton");
const ocrStatus = document.getElementById("ocrStatus");

const nameInput = document.getElementById("nameInput");
const companyInput = document.getElementById("companyInput");
const phoneInput = document.getElementById("phoneInput");
const emailInput = document.getElementById("emailInput");
const notesInput = document.getElementById("notesInput");
const saveContactButton = document.getElementById("saveContactButton");
const saveStatus = document.getElementById("saveStatus");

const cardsList = document.getElementById("cardsList");

const loginButton = document.getElementById("loginButton");
const logoutButton = document.getElementById("logoutButton");
const authStatus = document.getElementById("authStatus");
const authUserInfo = document.getElementById("authUserInfo");
const authLoginArea = document.getElementById("authLoginArea");
const userNameSpan = document.getElementById("userName");
const userEmailSpan = document.getElementById("userEmail");
const userAvatarImg = document.getElementById("userAvatar");

// ------------------------------------------------------------
// ⛔ 5. DESACTIVAR UI HASTA QUE SE COMPRUEBEN PERMISOS
// ------------------------------------------------------------
enableAppUI(false);

// ------------------------------------------------------------
// 🔐 6. LOGIN CON GOOGLE
// ------------------------------------------------------------
loginButton.addEventListener("click", async () => {
  try {
    authStatus.textContent = "Abriendo ventana de Google...";
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error(error);
    authStatus.textContent = "Error al iniciar sesión con Google.";
  }
});

logoutButton.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error(error);
    authStatus.textContent = "Error al cerrar sesión.";
  }
});

// ------------------------------------------------------------
// 🔍 7. CUANDO CAMBIA EL ESTADO DE LOGIN
// ------------------------------------------------------------
onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  if (user) {
    authStatus.textContent = "Comprobando permisos...";
    isAuthorized = await checkUserAuthorization(user);

    const displayName = user.displayName || "Usuario";
    const email = user.email || "";
    const photoURL = user.photoURL;

    authUserInfo.hidden = false;
    authLoginArea.style.display = "none";

    userNameSpan.textContent = displayName;
    userEmailSpan.textContent = email;
    userAvatarImg.src =
      photoURL ||
      "https://ui-avatars.com/api/?name=" + encodeURIComponent(displayName);

    if (!isAuthorized) {
      authStatus.textContent =
        "No tienes permisos para usar esta aplicación.";
      enableAppUI(false);
      cards = [];
      renderCardsList();
      clearForm(true);
      return;
    }

    authStatus.textContent = "Sesión iniciada.";
    enableAppUI(true);

    await loadCardsFromFirestore(user.uid);
    renderCardsList();
  } else {
    resetUserState();
  }
});

// ------------------------------------------------------------
// 📷 8. SUBIR FOTO
// ------------------------------------------------------------
imageInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    currentImageDataUrl = e.target.result;
    imagePreview.src = currentImageDataUrl;
    imagePreviewContainer.classList.remove("hidden");
    scanButton.disabled = !(currentUser && isAuthorized);
    ocrStatus.textContent = "Imagen cargada. Listo para escanear.";
  };
  reader.readAsDataURL(file);
});

// ------------------------------------------------------------
// 🔎 9. OCR (FAKE, SE PUEDE CAMBIAR POR EL REAL)
// ------------------------------------------------------------
scanButton.addEventListener("click", async () => {
  if (!currentUser || !isAuthorized) {
    ocrStatus.textContent =
      "No tienes permisos para usar el OCR.";
    return;
  }

  ocrStatus.textContent = "Procesando OCR...";
  scanButton.disabled = true;

  const text = await performFakeOCR(currentImageDataUrl);
  const parsed = parseBusinessCardText(text);

  if (!nameInput.value) nameInput.value = parsed.name || "";
  if (!companyInput.value) companyInput.value = parsed.company || "";
  if (!phoneInput.value) phoneInput.value = parsed.phone || "";
  if (!emailInput.value) emailInput.value = parsed.email || "";

  ocrStatus.textContent = "OCR completado.";

  scanButton.disabled = false;
});

// ------------------------------------------------------------
// 💾 10. GUARDAR TARJETA
// ------------------------------------------------------------
saveContactButton.addEventListener("click", async () => {
  if (!currentUser || !isAuthorized) {
    saveStatus.textContent =
      "No tienes permisos para guardar tarjetas.";
    return;
  }

  let name = nameInput.value.trim();
  let company = companyInput.value.trim();
  let phone = phoneInput.value.trim();
  let email = emailInput.value.trim();

  if (!name && !phone && !email) {
    saveStatus.textContent =
      "Debe haber como mínimo nombre, teléfono o email.";
    return;
  }

  const phoneNorm = normalizePhone(phone);
  const emailNorm = email.toLowerCase();

  const exists = cards.findIndex((c) => {
    return (
      (phoneNorm && normalizePhone(c.phone || "") === phoneNorm) ||
      (emailNorm && (c.email || "").toLowerCase() === emailNorm)
    );
  });

  saveStatus.textContent = "Guardando tarjeta...";
  saveContactButton.disabled = true;

  let imageUrl = null;
  let storagePath = null;

  try {
    if (currentImageDataUrl) {
      const id =
        exists !== -1 ? cards[exists].id : Date.now().toString();

      storagePath = `cards-images/${id}.jpg`;
      const imageRef = ref(storage, storagePath);

      await uploadString(imageRef, currentImageDataUrl, "data_url");
      imageUrl = await getDownloadURL(imageRef);
    }

    if (exists !== -1) {
      // actualizar
      const card = cards[exists];
      const docRef = doc(db, "cards", card.id);

      await updateDoc(docRef, {
        userId: currentUser.uid,
        name,
        company,
        phone,
        email,
        imageUrl,
        storagePath,
        updatedAt: serverTimestamp(),
      });

      saveStatus.textContent = "Tarjeta actualizada.";
    } else {
      // crear nueva
      const newCard = {
        userId: currentUser.uid,
        name,
        company,
        phone,
        email,
        imageUrl,
        storagePath,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, "cards"), newCard);
      cards.unshift({ id: docRef.id, ...newCard });

      saveStatus.textContent = "Tarjeta guardada.";
    }

    renderCardsList();
  } catch (e) {
    console.error(e);
    saveStatus.textContent = "Error al guardar.";
  }

  saveContactButton.disabled = false;
});

// ------------------------------------------------------------
// 📥 11. CARGAR TARJETAS
// ------------------------------------------------------------
async function loadCardsFromFirestore(uid) {
  cards = [];

  const q = query(
    collection(db, "cards"),
    where("userId", "==", uid)
  );

  const snap = await getDocs(q);
  snap.forEach((docSnap) => {
    cards.push({ id: docSnap.id, ...docSnap.data() });
  });

  cards.sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds);
}

// ------------------------------------------------------------
// 🔐 12. AUTORIZACIÓN (LISTA BLANCA)
// ------------------------------------------------------------
async function checkUserAuthorization(user) {
  const docRef = doc(db, "allowedUsers", user.uid);
  const snap = await getDoc(docRef);
  return snap.exists();
}

// ------------------------------------------------------------
// 📄 13. PARSEADOR OCR
// ------------------------------------------------------------
function parseBusinessCardText(text) {
  const result = {
    name: "",
    company: "",
    phone: "",
    email: "",
  };

  const lines = text.split("\n").map((l) => l.trim());

  const phoneRegex = /(\\+?\\d[\\d\\s\\-]{7,}\\d)/;
  const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[A-Za-z]{2,})/;

  for (const line of lines) {
    if (!result.email && emailRegex.test(line))
      result.email = line.match(emailRegex)[1];

    if (!result.phone && phoneRegex.test(line))
      result.phone = line.match(phoneRegex)[1];
  }

  result.name = lines[0] || "";
  result.company = lines[1] || "";

  return result;
}

// ------------------------------------------------------------
// 🛠 UTILIDADES
// ------------------------------------------------------------
function normalizePhone(p) {
  return (p || "").replace(/\\D+/g, "");
}

function enableAppUI(state) {
  const canUse = state && currentUser && isAuthorized;

  imageInput.disabled = !canUse;
  scanButton.disabled = !canUse || !currentImageDataUrl;
  saveContactButton.disabled = !canUse;
}

function clearForm() {
  currentImageDataUrl = null;
  imagePreview.src = "";
  imagePreviewContainer.classList.add("hidden");
  scanButton.disabled = true;
}

function resetUserState() {
  authStatus.textContent = "Inicia sesión con Google.";
  authUserInfo.hidden = true;
  authLoginArea.style.display = "block";
  cards = [];
  renderCardsList();
  enableAppUI(false);
  clearForm(true);
}

// ------------------------------------------------------------
// 🎭 14. OCR FALSO (puedes sustituirlo por el real)
// ------------------------------------------------------------
async function performFakeOCR() {
  return `
    Nombre Apellido
    Empresa Demo
    Tel: +34 600 123 456
    Email: ejemplo@demo.com
  `;
}
