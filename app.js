import { getFirebaseConfig } from "./firebase-config.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
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

let app, db, storage, auth, provider;

let currentUser = null;
let currentImageDataUrl = null;
let cards = [];

// Inicializar
try {
  const config = getFirebaseConfig();
  app = initializeApp(config);
  db = getFirestore(app);
  storage = getStorage(app);
  auth = getAuth(app);
  provider = new GoogleAuthProvider();
  console.log("Firebase cargado");
} catch (err) {
  console.error("Error Firebase:", err);
}

// Esperar DOM
window.addEventListener("DOMContentLoaded", () => {

  const loginButton = document.getElementById("loginButton");
  const logoutButton = document.getElementById("logoutButton");
  const authStatus = document.getElementById("authStatus");
  const authUserInfo = document.getElementById("authUserInfo");
  const authLoginArea = document.getElementById("authLoginArea");
  const userNameSpan = document.getElementById("userName");
  const userEmailSpan = document.getElementById("userEmail");
  const userAvatarImg = document.getElementById("userAvatar");

  const imageInput = document.getElementById("imageInput");
  const imagePreview = document.getElementById("imagePreview");
  const imagePreviewContainer = document.getElementById("imagePreviewContainer");

  const rotateButton = document.getElementById("rotateButton");
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

  // --- LOGIN ---
  loginButton.onclick = async () => {
    try {
      authStatus.textContent = "Abriendo Google...";
      await signInWithPopup(auth, provider);
    } catch (err) {
      authStatus.textContent = "Error login: " + err.code;
      console.error(err);
    }
  };

  logoutButton.onclick = async () => {
    await signOut(auth);
  };

  // --- CAMBIO DE USUARIO ---
  onAuthStateChanged(auth, async (user) => {
    currentUser = user;

    if (!user) {
      authUserInfo.hidden = true;
      authLoginArea.style.display = "block";
      authStatus.textContent = "Inicia sesión con Google.";
      cardsList.innerHTML = "";
      disableApp();
      return;
    }

    authLoginArea.style.display = "none";
    authUserInfo.hidden = false;

    userNameSpan.textContent = user.displayName;
    userEmailSpan.textContent = user.email;
    userAvatarImg.src = user.photoURL;

    authStatus.textContent = "Sesión iniciada.";

    enableApp();

    await loadCards(user.uid);
    renderCards();
  });

  // --- SUBIR IMAGEN ---
  imageInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      currentImageDataUrl = ev.target.result;
      imagePreview.src = currentImageDataUrl;
      imagePreviewContainer.classList.remove("hidden");

      scanButton.disabled = false;
      rotateButton.disabled = false;
    };
    reader.readAsDataURL(file);
  };

  // --- ROTAR 90º ---
  rotateButton.onclick = async () => {
    if (!currentImageDataUrl) return;
    currentImageDataUrl = await rotateDataUrl90(currentImageDataUrl);
    imagePreview.src = currentImageDataUrl;
  };

  // --- OCR SIMULADO ---
  scanButton.onclick = async () => {
    if (!currentImageDataUrl) {
      ocrStatus.textContent = "Sube una imagen antes.";
      return;
    }

    ocrStatus.textContent = "Procesando OCR (simulado)...";

    const text = await performFakeOCR();
    const parsed = parseBusinessCardText(text);

    nameInput.value = parsed.name;
    companyInput.value = parsed.company;
    phoneInput.value = parsed.phone;
    emailInput.value = parsed.email;

    ocrStatus.textContent = "OCR completado.";
  };

  // --- GUARDAR CONTACTO ---
  saveContactButton.onclick = async () => {
    if (!currentUser) return;

    const name = nameInput.value.trim();
    const company = companyInput.value.trim();
    const phone = phoneInput.value.trim();
    const email = emailInput.value.trim();
    const notes = notesInput.value.trim();

    if (!name && !phone && !email) {
      saveStatus.textContent = "Rellena algún campo.";
      return;
    }

    saveStatus.textContent = "Guardando...";

    let imageUrl = null;

    // 1. Subir imagen
    if (currentImageDataUrl) {
      try {
        const id = Date.now();
        const storagePath = `cards-images/${id}.jpg`;
        const imageRef = ref(storage, storagePath);

        await uploadString(imageRef, currentImageDataUrl, "data_url");
        imageUrl = await getDownloadURL(imageRef);
      } catch (err) {
        saveStatus.textContent = "Error subiendo imagen";
        console.error(err);
        return;
      }
    }

    // 2. Guardar en Firestore
    await addDoc(collection(db, "cards"), {
      userId: currentUser.uid,
      name,
      company,
      phone,
      email,
      notes,
      imageUrl,
      createdAt: serverTimestamp()
    });

    saveStatus.textContent = "Guardado correctamente.";

    await loadCards(currentUser.uid);
    renderCards();
  };

  // --- FUNCIONES ---
  async function loadCards(uid) {
    cards = [];
    const q = query(collection(db, "cards"), where("userId", "==", uid));
    const snap = await getDocs(q);
    snap.forEach((doc) => cards.push({ id: doc.id, ...doc.data() }));
  }

  function renderCards() {
    cardsList.innerHTML = "";
    cards.forEach((card) => {
      const div = document.createElement("div");
      div.className = "saved-card";

      div.innerHTML = `
        <div class="saved-card-thumbnail">
          ${card.imageUrl ? `<img src="${card.imageUrl}" />` : "T"}
        </div>
        <div class="saved-card-content">
          <div class="saved-card-title">${card.name || "Sin nombre"}</div>
          <div class="saved-card-subtitle">${card.company || ""}</div>
          <div class="saved-card-meta">
            ${card.phone || ""} ${card.email ? " · " + card.email : ""}
          </div>
        </div>
      `;

      cardsList.appendChild(div);
    });
  }

  function disableApp() {
    imageInput.disabled = true;
    scanButton.disabled = true;
    rotateButton.disabled = true;
    saveContactButton.disabled = true;
  }

  function enableApp() {
    imageInput.disabled = false;
  }
});

// --- ROTAR IMAGEN ---
function rotateDataUrl90(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      canvas.width = img.height;
      canvas.height = img.width;

      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);

      resolve(canvas.toDataURL("image/jpeg", 0.9));
    };
    img.src = dataUrl;
  });
}

// --- OCR FAKE ---
async function performFakeOCR() {
  await new Promise((r) => setTimeout(r, 800));
  return `
    Nombre Apellido
    Empresa Ejemplo
    Tel: +34 600 123 456
    Email: ejemplo@empresa.com
  `;
}

function parseBusinessCardText(text) {
  return {
    name: "Nombre Apellido",
    company: "Empresa Ejemplo",
    phone: "+34 600 123 456",
    email: "ejemplo@empresa.com"
  };
}
