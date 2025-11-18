import { firebaseBaseConfig } from "./firebase-config.js";

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


// 🔥 1. Obtener API KEY desde localStorage
const apiKey = localStorage.getItem("FIREBASE_API_KEY");

if (!apiKey) {
  alert("Falta la API KEY. Pulsa 'Cambiar API Key de Firebase'.");
  throw new Error("No Firebase API Key");
}

// 🔥 2. Construir config final de Firebase
const firebaseConfig = {
  ...firebaseBaseConfig,
  apiKey: apiKey,
};

// 🔥 3. Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();


// --- Estados ---
let currentUser = null;
let isAuthorized = false;
let cards = [];
let currentImageDataUrl = null;


// --- Esperar a que cargue el DOM ---
window.addEventListener("DOMContentLoaded", () => {

  console.log("🔥 Firebase inicializado con API Key:", apiKey);

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

  authStatus.textContent = "Introduce la API Key si no está configurada.";

  loginButton.addEventListener("click", async () => {
    authStatus.textContent = "Abriendo Google...";
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error(err);
      authStatus.textContent = "Error: " + (err.code || err.message);
    }
  });

  logoutButton.addEventListener("click", async () => {
    await signOut(auth);
  });

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      currentUser = null;
      isAuthorized = false;

      authUserInfo.hidden = true;
      authLoginArea.style.display = "block";
      authStatus.textContent = "Inicia sesión con Google.";

      cards = [];
      cardsList.innerHTML = "";
      return;
    }

    currentUser = user;
    authStatus.textContent = "Verificando permisos...";

    isAuthorized = await checkUserAuthorization(user);

    userNameSpan.textContent = user.displayName;
    userEmailSpan.textContent = user.email;
    userAvatarImg.src = user.photoURL;

    authUserInfo.hidden = false;
    authLoginArea.style.display = "none";

    if (!isAuthorized) {
      authStatus.textContent =
        "No tienes permisos. Debes estar en la lista allowedUsers.";
      return;
    }

    authStatus.textContent = "Sesión iniciada.";
    await loadCardsFromFirestore(user.uid);
    renderCardsList(cardsList);
  });

  imageInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      currentImageDataUrl = ev.target.result;
      imagePreview.src = currentImageDataUrl;
      imagePreviewContainer.classList.remove("hidden");
      scanButton.disabled = false;
    };
    reader.readAsDataURL(file);
  });

  scanButton.addEventListener("click", async () => {
    ocrStatus.textContent = "OCR en proceso...";

    const text = await performFakeOCR();
    const parsed = parseBusinessCardText(text);

    nameInput.value = parsed.name;
    companyInput.value = parsed.company;
    phoneInput.value = parsed.phone;
    emailInput.value = parsed.email;

    ocrStatus.textContent = "OCR completado.";
  });

  saveContactButton.addEventListener("click", async () => {
    if (!currentUser || !isAuthorized) {
      saveStatus.textContent = "No autorizado.";
      return;
    }

    saveStatus.textContent = "Guardando...";

    let imageUrl = null;
    let storagePath = null;

    if (currentImageDataUrl) {
      const id = Date.now().toString();
      storagePath = `cards-images/${id}.jpg`;

      const imageRef = ref(storage, storagePath);
      await uploadString(imageRef, currentImageDataUrl, "data_url");

      imageUrl = await getDownloadURL(imageRef);
    }

    const newCard = {
      userId: currentUser.uid,
      name: nameInput.value,
      company: companyInput.value,
      phone: phoneInput.value,
      email: emailInput.value,
      notes: notesInput.value,
      imageUrl,
      storagePath,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const refNew = await addDoc(collection(db, "cards"), newCard);
    cards.unshift({ id: refNew.id, ...newCard });

    saveStatus.textContent = "Tarjeta guardada.";
    renderCardsList(cardsList);
  });
});


// --- Lista blanca ---
async function checkUserAuthorization(user) {
  const docRef = doc(getFirestore(), "allowedUsers", user.uid);
  const snap = await getDoc(docRef);
  return snap.exists();
}


// --- Cargar tarjetas ---
async function loadCardsFromFirestore(uid) {
  const q = query(collection(getFirestore(), "cards"), where("userId", "==", uid));
  const snap = await getDocs(q);

  cards = [];
  snap.forEach((docSnap) => {
    cards.push({ id: docSnap.id, ...docSnap.data() });
  });
}


// --- Render ---
function renderCardsList(cardsList) {
  cardsList.innerHTML = "";

  if (!cards.length) {
    cardsList.innerHTML = "<p>No hay tarjetas guardadas.</p>";
    return;
  }

  cards.forEach((c) => {
    const div = document.createElement("div");
    div.className = "saved-card";

    div.innerHTML = `
      <div class="saved-card-thumbnail">
        ${c.imageUrl ? `<img src="${c.imageUrl}" />` : "T"}
      </div>

      <div class="saved-card-content">
        <div class="saved-card-title">${c.name || "Sin nombre"}</div>
        <div class="saved-card-subtitle">${c.company || ""}</div>
        <div class="saved-card-meta">
          ${c.phone ? "📞 " + c.phone : ""}
          ${c.email ? " · ✉️ " + c.email : ""}
        </div>
      </div>
    `;
    cardsList.appendChild(div);
  });
}


// --- OCR Fake (simulado) ---
async function performFakeOCR() {
  await new Promise((res) => setTimeout(res, 800));
  return `
    Nombre Apellido
    Empresa Ejemplo
    Tel: +34 600 123 456
    Email: ejemplo@empresa.com
  `;
}

function parseBusinessCardText(text) {
  const result = { name: "", company: "", phone: "", email: "" };
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,})/;
  const phoneRegex = /(\+?\d[\d\s\-]{7,}\d)/;

  for (const line of lines) {
    if (emailRegex.test(line)) result.email = line.match(emailRegex)[1];
    if (phoneRegex.test(line)) result.phone = line.match(phoneRegex)[1];
  }

  result.name = lines[0] || "";
  result.company = lines[1] || "";

  return result;
}
