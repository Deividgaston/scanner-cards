// app.js — versión limpia con Auth + Firestore + Storage + lista blanca

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

// Inicializamos Firebase (esto puede ir fuera del DOMContentLoaded)
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// Estado global
let currentUser = null;
let isAuthorized = false;
let currentImageDataUrl = null;
let cards = [];

// Todo el acceso al DOM lo hacemos cuando la página ya está cargada
window.addEventListener("DOMContentLoaded", () => {
  console.log("App JS cargado y DOM listo");

  // --- Selectores de elementos ---
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

  // Mensaje de que la app ha cargado
  if (authStatus) {
    authStatus.textContent = "App cargada. Inicia sesión con Google.";
  }

  // Desactivamos la UI al principio
  enableAppUI(false, { imageInput, scanButton, saveContactButton });

  // --- Login Google ---
  loginButton.addEventListener("click", async () => {
    authStatus.textContent = "Abriendo ventana de Google...";
    console.log("Click en botón de login");

    try {
      await signInWithPopup(auth, provider);
      // El resto se gestiona en onAuthStateChanged
    } catch (error) {
      console.error("Error en signInWithPopup:", error);
      authStatus.textContent = "Error: " + (error.code || error.message);
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

  // --- Cambios en el estado de autenticación ---
  onAuthStateChanged(auth, async (user) => {
    currentUser = user;

    if (user) {
      authStatus.textContent = "Comprobando permisos...";
      console.log("Usuario autenticado:", user.uid);

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
          "Tu cuenta no está autorizada para usar esta app.";
        enableAppUI(false, { imageInput, scanButton, saveContactButton });
        cardsList.innerHTML =
          '<p style="font-size:0.85rem;color:#9ca3af;">Sin permisos.</p>';
        return;
      }

      authStatus.textContent = "Sesión iniciada correctamente.";
      enableAppUI(true, { imageInput, scanButton, saveContactButton });

      await loadCardsFromFirestore(user.uid);
      renderCardsList(cards, cardsList);
    } else {
      console.log("Usuario deslogueado");
      currentUser = null;
      isAuthorized = false;

      authUserInfo.hidden = true;
      authLoginArea.style.display = "block";
      authStatus.textContent = "Inicia sesión con Google para usar la app.";

      cards = [];
      renderCardsList(cards, cardsList);
      enableAppUI(false, { imageInput, scanButton, saveContactButton });
      clearForm({ imagePreviewContainer, imagePreview, scanButton, ocrStatus });
    }
  });

  // --- Manejo de imagen ---
  imageInput.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      currentImageDataUrl = e.target.result;
      imagePreview.src = currentImageDataUrl;
      imagePreviewContainer.classList.remove("hidden");
      scanButton.disabled = !(currentUser && isAuthorized);
      ocrStatus.textContent = "Imagen lista para escanear.";
    };
    reader.readAsDataURL(file);
  });

  // --- Botón OCR ---
  scanButton.addEventListener("click", async () => {
    if (!currentUser || !isAuthorized) {
      ocrStatus.textContent =
        "No tienes permisos para usar el OCR.";
      return;
    }

    if (!currentImageDataUrl) return;

    scanButton.disabled = true;
    ocrStatus.textContent = "Procesando OCR...";

    try {
      const text = await performFakeOCR();
      const parsed = parseBusinessCardText(text);

      nameInput.value = parsed.name || "";
      companyInput.value = parsed.company || "";
      phoneInput.value = parsed.phone || "";
      emailInput.value = parsed.email || "";

      ocrStatus.textContent = "OCR completado.";
    } catch (error) {
      console.error(error);
      ocrStatus.textContent = "Error al ejecutar OCR.";
    } finally {
      scanButton.disabled = false;
    }
  });

  // --- Guardar contacto ---
  saveContactButton.addEventListener("click", async () => {
    if (!currentUser || !isAuthorized) {
      saveStatus.textContent = "No tienes permisos para guardar.";
      return;
    }

    const name = nameInput.value.trim();
    const company = companyInput.value.trim();
    const phone = phoneInput.value.trim();
    const email = emailInput.value.trim();
    const notes = notesInput.value.trim();

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
      renderCardsList(cards, cardsList);
    } catch (error) {
      console.error(error);
      saveStatus.textContent = "Error al guardar la tarjeta.";
    } finally {
      saveContactButton.disabled = false;
    }
  });
});

// ------------------------------------------------------------
// 🔐 Lista blanca allowedUsers
// ------------------------------------------------------------
async function checkUserAuthorization(user) {
  try {
    const docRef = doc(db, "allowedUsers", user.uid);
    const snap = await getDoc(docRef);
    return snap.exists();
  } catch (error) {
    console.error("Error comprobando autorización:", error);
    return false;
  }
}

// ------------------------------------------------------------
// 🔄 Cargar tarjetas desde Firestore
// ------------------------------------------------------------
async function loadCardsFromFirestore(uid) {
  cards = [];

  try {
    const cardsRef = collection(db, "cards");
    const q = query(cardsRef, where("userId", "==", uid));
    const snapshot = await getDocs(q);

    snapshot.forEach((docSnap) => {
      cards.push({ id: docSnap.id, ...docSnap.data() });
    });

    cards.sort((a, b) => {
      const aTime = a.createdAt?.seconds || 0;
      const bTime = b.createdAt?.seconds || 0;
      return bTime - aTime;
    });
  } catch (error) {
    console.error("Error cargando tarjetas:", error);
  }
}

// ------------------------------------------------------------
// 🖼 Renderizar tarjetas
// ------------------------------------------------------------
function renderCardsList(cards, cardsList) {
  if (!cardsList) return;

  if (!currentUser || !isAuthorized) {
    cardsList.innerHTML =
      '<p style="font-size:0.85rem;color:#9ca3af;">Inicia sesión con un usuario autorizado.</p>';
    return;
  }

  if (!cards.length) {
    cardsList.innerHTML =
      '<p style="font-size:0.85rem;color:#9ca3af;">No hay tarjetas guardadas todavía.</p>';
    return;
  }

  cardsList.innerHTML = "";

  cards.forEach((card) => {
    const div = document.createElement("div");
    div.className = "saved-card";

    const imagePart = card.imageUrl
      ? `<img src="${card.imageUrl}" alt="${card.name || "Tarjeta"}" />`
      : "T";

    div.innerHTML = `
      <div class="saved-card-thumbnail">
        ${imagePart}
      </div>
      <div class="saved-card-content">
        <div class="saved-card-title">${card.name || "Sin nombre"}</div>
        <div class="saved-card-subtitle">${card.company || ""}</div>
        <div class="saved-card-meta">
          ${card.phone ? `📞 ${card.phone}` : ""}
          ${card.email ? ` · ✉️ ${card.email}` : ""}
        </div>
      </div>
    `;

    cardsList.appendChild(div);
  });
}

// ------------------------------------------------------------
// 🛠 Utilidades de UI
// ------------------------------------------------------------
function enableAppUI(enabled, { imageInput, scanButton, saveContactButton }) {
  const canUse = enabled && currentUser && isAuthorized;

  if (imageInput) imageInput.disabled = !canUse;
  if (scanButton) scanButton.disabled = !canUse || !currentImageDataUrl;
  if (saveContactButton) saveContactButton.disabled = !canUse;
}

function clearForm({ imagePreviewContainer, imagePreview, scanButton, ocrStatus }) {
  currentImageDataUrl = null;
  if (imagePreview) imagePreview.src = "";
  if (imagePreviewContainer) imagePreviewContainer.classList.add("hidden");
  if (scanButton) scanButton.disabled = true;
  if (ocrStatus) ocrStatus.textContent = "";
}

// ------------------------------------------------------------
// OCR Fake
// ------------------------------------------------------------
async function performFakeOCR() {
  // Simulamos un pequeño delay
  await new Promise((res) => setTimeout(res, 800));
  return `
    Nombre Apellido
    Empresa Ejemplo
    Tel: +34 600 123 456
    Email: ejemplo@empresa.com
  `;
}

// ------------------------------------------------------------
// Parseo de texto de tarjeta
// ------------------------------------------------------------
function parseBusinessCardText(text) {
  const result = {
    name: "",
    company: "",
    phone: "",
    email: "",
  };

  if (!text) return result;

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,})/;
  const phoneRegex = /(\+?\d[\d\s\-]{7,}\d)/;

  for (const line of lines) {
    if (!result.email && emailRegex.test(line)) {
      result.email = line.match(emailRegex)[1];
    }
    if (!result.phone && phoneRegex.test(line)) {
      result.phone = line.match(phoneRegex)[1];
    }
  }

  result.name = lines[0] || "";
  result.company = lines[1] || "";

  return result;
}
