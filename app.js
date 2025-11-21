// app.js - Escáner de tarjetas con Firebase Auth + Firestore + Storage
// Usa la API key guardada en localStorage (firebaseApiKey)

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
let cards = [];
let currentImageDataUrl = null;

// Inicializar Firebase leyendo la API key desde localStorage
try {
  const firebaseConfig = getFirebaseConfig();
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  storage = getStorage(app);
  auth = getAuth(app);
  provider = new GoogleAuthProvider();
  console.log("✅ Firebase inicializado correctamente");
} catch (error) {
  console.error("Error al inicializar Firebase:", error);
}

window.addEventListener("DOMContentLoaded", () => {
  console.log("✅ DOM listo");

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

  // Si Firebase NO se pudo inicializar (no hay API key)
  if (!app || !auth) {
    if (authStatus) {
      authStatus.textContent =
        "Falta configurar la API key. Pulsa 'Configurar API Key de Firebase'.";
    }
    if (loginButton) loginButton.disabled = true;
    if (logoutButton) logoutButton.disabled = true;
    if (imageInput) imageInput.disabled = true;
    if (scanButton) scanButton.disabled = true;
    if (saveContactButton) saveContactButton.disabled = true;
    return;
  }

  authStatus.textContent = "App cargada. Inicia sesión con Google.";

  // Login con Google
  loginButton.addEventListener("click", async () => {
    authStatus.textContent = "Abriendo ventana de Google...";
    console.log("🟢 Click en Iniciar sesión");
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Error en signInWithPopup:", error);
      authStatus.textContent =
        "Error al iniciar sesión: " + (error.code || error.message);
    }
  });

  // Logout
  logoutButton.addEventListener("click", async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error(error);
      authStatus.textContent = "Error al cerrar sesión.";
    }
  });

  // Cambios de sesión
  onAuthStateChanged(auth, async (user) => {
    currentUser = user;

    if (!user) {
      console.log("👤 Usuario deslogueado");
      authUserInfo.hidden = true;
      authLoginArea.style.display = "block";
      authStatus.textContent = "Inicia sesión con Google para usar la app.";
      cards = [];
      renderCardsList(cardsList);
      toggleAppUI(false, { imageInput, scanButton, saveContactButton });
      return;
    }

    console.log("👤 Usuario autenticado:", user.uid);
    authUserInfo.hidden = false;
    authLoginArea.style.display = "none";

    userNameSpan.textContent = user.displayName || "Usuario";
    userEmailSpan.textContent = user.email || "";
    userAvatarImg.src =
      user.photoURL ||
      "https://ui-avatars.com/api/?name=" + encodeURIComponent(user.displayName || "U");

    authStatus.textContent = "Sesión iniciada correctamente.";

    toggleAppUI(true, { imageInput, scanButton, saveContactButton });

    await loadCardsFromFirestore(user.uid);
    renderCardsList(cardsList);
  });

  // Subir imagen
  imageInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      currentImageDataUrl = ev.target.result;
      imagePreview.src = currentImageDataUrl;
      imagePreviewContainer.classList.remove("hidden");
      scanButton.disabled = false;
      ocrStatus.textContent = "Imagen cargada. Pulsa en escanear para extraer datos.";
    };
    reader.readAsDataURL(file);
  });

  // OCR falso
  scanButton.addEventListener("click", async () => {
    if (!currentImageDataUrl) {
      ocrStatus.textContent = "Primero sube una imagen.";
      return;
    }
    ocrStatus.textContent = "Procesando OCR...";
    console.log("🔍 Lanzando OCR simulado...");

    const text = await performFakeOCR();
    console.log("🔍 Texto OCR simulado:", text);

    const parsed = parseBusinessCardText(text);
    console.log("🔍 Datos parseados:", parsed);

    nameInput.value = parsed.name;
    companyInput.value = parsed.company;
    phoneInput.value = parsed.phone;
    emailInput.value = parsed.email;

    ocrStatus.textContent = "OCR completado. Revisa los datos antes de guardar.";
  });

  // Guardar tarjeta
  saveContactButton.addEventListener("click", async () => {
    if (!currentUser) {
      saveStatus.textContent = "Inicia sesión para guardar tarjetas.";
      return;
    }

    const name = nameInput.value.trim();
    const company = companyInput.value.trim();
    const phone = phoneInput.value.trim();
    const email = emailInput.value.trim();
    const notes = notesInput.value.trim();

    if (!name && !phone && !email) {
      saveStatus.textContent =
        "Introduce al menos nombre, teléfono o email para guardar.";
      return;
    }

    saveStatus.textContent = "Comprobando si ya existe...";
    try {
      const duplicate = await isDuplicateCard(currentUser.uid, email);
      if (duplicate) {
        saveStatus.textContent =
          "Ya existe una tarjeta con este email. No se ha duplicado.";
        return;
      }
    } catch (error) {
      console.error("Error comprobando duplicados:", error);
      // seguimos igualmente para no bloquear al usuario
    }

    saveStatus.textContent = "Guardando tarjeta...";
    let imageUrl = null;
    let storagePath = null;

    try {
      // 1) Subir imagen a Storage (si hay)
      if (currentImageDataUrl) {
        const id = Date.now().toString();
        storagePath = `cards-images/${id}.jpg`;
        console.log("📤 Subiendo imagen a Storage en:", storagePath);

        const imageRef = ref(storage, storagePath);
        await uploadString(imageRef, currentImageDataUrl, "data_url");

        imageUrl = await getDownloadURL(imageRef);
        console.log("✅ Imagen subida, URL:", imageUrl);
      }

      // 2) Guardar documento en Firestore
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
      console.log("✅ Tarjeta guardada con ID:", docRef.id);

      cards.unshift({ id: docRef.id, ...newCard });

      saveStatus.textContent = "Tarjeta guardada correctamente.";
      renderCardsList(cardsList);
    } catch (error) {
      console.error("❌ Error al guardar tarjeta o subir imagen:", error);
      saveStatus.textContent = "Error al guardar la tarjeta (revisa consola).";
    }
  });
});

// ---------- Funciones auxiliares ----------

// Comprobar si ya existe una tarjeta con el mismo email para este usuario
async function isDuplicateCard(uid, email) {
  if (!email) return false;
  const q = query(
    collection(db, "cards"),
    where("userId", "==", uid),
    where("email", "==", email)
  );

  const snap = await getDocs(q);
  return !snap.empty;
}

// Cargar tarjetas del usuario
async function loadCardsFromFirestore(uid) {
  try {
    console.log("📥 Cargando tarjetas para uid:", uid);
    const q = query(collection(db, "cards"), where("userId", "==", uid));
    const snap = await getDocs(q);
    cards = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      console.log("➡️ Tarjeta cargada:", docSnap.id, data);
      cards.push({ id: docSnap.id, ...data });
    });
  } catch (error) {
    console.error("❌ Error al cargar tarjetas desde Firestore:", error);
  }
}

// Render listado
function renderCardsList(container) {
  if (!container) return;

  if (!currentUser) {
    container.innerHTML =
      "<p style='font-size:0.85rem;color:#9ca3af;'>Inicia sesión para ver tus tarjetas.</p>";
    return;
  }

  if (!cards.length) {
    container.innerHTML =
      "<p style='font-size:0.85rem;color:#9ca3af;'>No hay tarjetas guardadas todavía.</p>";
    return;
  }

  container.innerHTML = "";
  cards.forEach((card) => {
    const div = document.createElement("div");
    div.className = "saved-card";

    const thumb = card.imageUrl
      ? `<img src="${card.imageUrl}" alt="Tarjeta" />`
      : "T";

    div.innerHTML = `
      <div class="saved-card-thumbnail">${thumb}</div>
      <div class="saved-card-content">
        <div class="saved-card-title">${card.name || "Sin nombre"}</div>
        <div class="saved-card-subtitle">${card.company || ""}</div>
        <div class="saved-card-meta">
          ${card.phone ? "📞 " + card.phone : ""}
          ${card.email ? " · ✉️ " + card.email : ""}
        </div>
      </div>
    `;

    container.appendChild(div);
  });
}

function toggleAppUI(enabled, { imageInput, scanButton, saveContactButton }) {
  imageInput.disabled = !enabled;
  scanButton.disabled = !enabled || !currentImageDataUrl;
  saveContactButton.disabled = !enabled;
}

// Simulación de OCR para pruebas
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
  const result = { name: "", company: "", phone: "", email: "" };
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
