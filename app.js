// ------------------------------------------------------------
// app.js — versión limpia y estable
// Firebase Auth + Firestore + Storage + Lista blanca + OCR
// ------------------------------------------------------------

import { firebaseConfig } from "./firebase-config.js";

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
// 🔥 Inicializar Firebase
// ------------------------------------------------------------
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// ------------------------------------------------------------
// 🧠 Estados internos
// ------------------------------------------------------------
let currentUser = null;
let isAuthorized = false;
let currentImageDataUrl = null;
let cards = [];

// ------------------------------------------------------------
// 📌 Elementos del DOM
// ------------------------------------------------------------
const loginButton = document.getElementById("loginButton");
const logoutButton = document.getElementById("logoutButton");
const authStatus = document.getElementById("authStatus");
const authUserInfo = document.getElementById("authUserInfo");
const authLoginArea = document.getElementById("authLoginArea");
const userNameSpan = document.getElementById("userName");
const userEmailSpan = document.getElementById("userEmail");
const userAvatarImg = document.getElementById("userAvatar");

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

enableAppUI(false);

// ------------------------------------------------------------
// 🔐 LOGIN
// ------------------------------------------------------------

loginButton.addEventListener("click", async () => {
  try {
    authStatus.textContent = "Abriendo ventana de Google...";
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error(error);
    authStatus.textContent = "Error: " + (error.code || error.message);
  }
});

logoutButton.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error(error);
    authStatus.textContent = "Error al cerrar sesión";
  }
});

// ------------------------------------------------------------
// 🔄 CAMBIO DE ESTADO DE USUARIO
// ------------------------------------------------------------

onAuthStateChanged(auth, async (user) => {
  currentUser = user;

  if (user) {
    authStatus.textContent = "Comprobando permisos...";

    isAuthorized = await checkUserAuthorization(user);

    const displayName = user.displayName || "Usuario";
    const email = user.email || "";

    userNameSpan.textContent = displayName;
    userEmailSpan.textContent = email;
    userAvatarImg.src =
      user.photoURL ||
      "https://ui-avatars.com/api/?name=" + encodeURIComponent(displayName);

    authUserInfo.hidden = false;
    authLoginArea.style.display = "none";

    if (!isAuthorized) {
      authStatus.textContent =
        "Tu cuenta no está autorizada para usar esta app.";
      enableAppUI(false);
      cardsList.innerHTML = "";
      return;
    }

    authStatus.textContent = "Sesión iniciada.";
    enableAppUI(true);

    await loadCardsFromFirestore(user.uid);
    renderCardsList();
  } else {
    resetToLoggedOut();
  }
});

// ------------------------------------------------------------
// 📸 SUBIR IMAGEN
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
    ocrStatus.textContent = "Imagen lista para escanear";
  };
  reader.readAsDataURL(file);
});

// ------------------------------------------------------------
// 🔍 OCR (FAKE, PERO FUNCIONA)
// ------------------------------------------------------------

scanButton.addEventListener("click", async () => {
  if (!currentUser || !isAuthorized) {
    ocrStatus.textContent =
      "No tienes permisos para usar el OCR.";
    return;
  }

  scanButton.disabled = true;
  ocrStatus.textContent = "Procesando OCR...";

  const text = await performFakeOCR();
  const parsed = parseBusinessCardText(text);

  nameInput.value = parsed.name || "";
  companyInput.value = parsed.company || "";
  phoneInput.value = parsed.phone || "";
  emailInput.value = parsed.email || "";

  scanButton.disabled = false;
  ocrStatus.textContent = "OCR completado.";
});

// ------------------------------------------------------------
// 💾 GUARDAR TARJETA
// ------------------------------------------------------------

saveContactButton.addEventListener("click", async () => {
  if (!currentUser || !isAuthorized) {
    saveStatus.textContent = "No tienes permisos.";
    return;
  }

  let name = nameInput.value.trim();
  let company = companyInput.value.trim();
  let phone = phoneInput.value.trim();
  let email = emailInput.value.trim();
  let notes = notesInput.value.trim();

  if (!name && !phone && !email) {
    saveStatus.textContent =
      "Introduce al menos nombre, teléfono o email.";
    return;
  }

  saveStatus.textContent = "Guardando...";
  saveContactButton.disabled = true;

  let imageUrl = null;
  let storagePath = null;

  try {
    if (currentImageDataUrl) {
      const id = Date.now().toString();
      storagePath = `cards-images/${id}.jpg`;
      const imageRef = ref(storage, storagePath);

      await uploadString(imageRef, currentImageDataUrl, "data_url");
      imageUrl = await getDownloadURL(imageRef);
    }

    const newCard = {
      userId: currentUser.uid,
      name,
      company,
      phone,
      email,
      notes,
      imageUrl,
      storagePath,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const docRef = await addDoc(collection(db, "cards"), newCard);

    cards.unshift({ id: docRef.id, ...newCard });

    saveStatus.textContent = "Tarjeta guardada.";
    renderCardsList();
  } catch (e) {
    console.error(e);
    saveStatus.textContent = "Error al guardar.";
  }

  saveContactButton.disabled = false;
});

// ------------------------------------------------------------
// 📥 CARGAR TARJETAS
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
// 🛂 LISTA BLANCA allowedUsers
// ------------------------------------------------------------

async function checkUserAuthorization(user) {
  const docRef = doc(db, "allowedUsers", user.uid);
  const snap = await getDoc(docRef);
  return snap.exists();
}

// ------------------------------------------------------------
// 🖼 RENDER DE TARJETAS
// ------------------------------------------------------------

function renderCardsList() {
  if (!currentUser || !isAuthorized) {
    cardsList.innerHTML =
      "<p>No autorizado o sin sesión.</p>";
    return;
  }

  if (!cards.length) {
    cardsList.innerHTML =
      "<p>No hay tarjetas guardadas.</p>";
    return;
  }

  cardsList.innerHTML = "";

  cards.forEach((card) => {
    const div = document.createElement("div");
    div.className = "saved-card";

    div.innerHTML = `
      <div class="saved-card-thumbnail">${
        card.imageUrl
          ? `<img src="${card.imageUrl}" />`
          : "T"
      }</div>

      <div class="saved-card-content">
        <div class="saved-card-title">${card.name || "Sin nombre"}</div>
        <div class="saved-card-subtitle">${card.company || ""}</div>
        <div class="saved-card-meta">
          ${card.phone ? `📞 ${card.phone}` : ""}
          ${
            card.email
              ? ` · ✉️ ${card.email}`
              : ""
          }
        </div>
      </div>
    `;

    cardsList.appendChild(div);
  });
}

// ------------------------------------------------------------
// 🛠 FUNCIONES UTILIDAD
// ------------------------------------------------------------

function enableAppUI(enabled) {
  const allowed = enabled && currentUser && isAuthorized;

  imageInput.disabled = !allowed;
  scanButton.disabled = !allowed || !currentImageDataUrl;
  saveContactButton.disabled = !allowed;
}

function resetToLoggedOut() {
  currentUser = null;
  isAuthorized = false;
  authUserInfo.hidden = true;
  authLoginArea.style.display = "block";
  authStatus.textContent = "Inicia sesión con Google.";
  cards = [];
  renderCardsList();
  enableAppUI(false);
}

// ------------------------------------------------------------
// 🔎 OCR FAKE
// ------------------------------------------------------------

async function performFakeOCR() {
  return `
    Nombre Apellido
    Empresa Ejemplo
    Tel: +34 600 123 456
    Email: ejemplo@empresa.com
  `;
}

// ------------------------------------------------------------
// 🔎 PARSEADOR
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
  const emailRegex =
    /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[A-Za-z]{2,})/;

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
