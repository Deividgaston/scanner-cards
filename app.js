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

// Inicializar Firebase
try {
  const config = getFirebaseConfig();
  app = initializeApp(config);
  db = getFirestore(app);
  storage = getStorage(app);
  auth = getAuth(app);
  provider = new GoogleAuthProvider();
  console.log("✅ Firebase cargado");
} catch (err) {
  console.error("Error inicializando Firebase:", err);
}

// DOM
window.addEventListener("DOMContentLoaded", () => {
  console.log("✅ DOM listo");

  const loginButton = document.getElementById("loginButton");
  const logoutButton = document.getElementById("logoutButton");
  const authStatus = document.getElementById("authStatus");
  const authUserInfo = document.getElementById("authUserInfo");
  const authLoginArea = document.getElementById("authLoginArea");
  const userNameSpan = document.getElementById("userName");
  const userEmailSpan = document.getElementById("userEmail");

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

  // Si Firebase no está bien configurado, bloqueamos
  if (!app || !auth) {
    authStatus.textContent =
      "Falta configurar Firebase. Usa 'Configurar API Key de Firebase'.";
    disableApp();
    return;
  }

  // --- LOGIN ---
  loginButton.onclick = async () => {
    try {
      authStatus.textContent = "Abriendo Google...";
      await signInWithPopup(auth, provider);
    } catch (err) {
      authStatus.textContent = "Error login: " + (err.code || err.message);
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

    userNameSpan.textContent = user.displayName || "";
    userEmailSpan.textContent = user.email || "";

    authStatus.textContent = "Sesión iniciada.";
    enableApp();

    await loadCards(user.uid);
    renderCards(cardsList);
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
      ocrStatus.textContent = "Imagen cargada. Puedes rotarla o escanearla.";
    };
    reader.readAsDataURL(file);
  };

  // --- ROTAR 90º ---
  rotateButton.onclick = async () => {
    if (!currentImageDataUrl) return;
    try {
      currentImageDataUrl = await rotateDataUrl90(currentImageDataUrl);
      imagePreview.src = currentImageDataUrl;
      ocrStatus.textContent = "Imagen rotada 90º.";
    } catch (err) {
      console.error("Error rotando:", err);
      ocrStatus.textContent = "Error al rotar la imagen.";
    }
  };

  // --- OCR REAL CON TESSERACT ---
  scanButton.onclick = async () => {
    if (!currentImageDataUrl) {
      ocrStatus.textContent = "Sube una imagen antes.";
      return;
    }

    ocrStatus.textContent = "Leyendo texto (OCR)...";
    console.log("🔍 Iniciando OCR real con Tesseract...");

    try {
      const text = await performRealOCR(currentImageDataUrl);
      console.log("🔍 Texto OCR:", text);

      const parsed = parseBusinessCardText(text);
      console.log("🔍 Datos parseados:", parsed);

      if (!parsed.name && !parsed.email && !parsed.phone) {
        ocrStatus.textContent =
          "No se ha detectado bien el texto. Revisa la foto o ajusta manualmente.";
      } else {
        ocrStatus.textContent = "OCR completado. Revisa los datos.";
      }

      if (parsed.name) nameInput.value = parsed.name;
      if (parsed.company) companyInput.value = parsed.company;
      if (parsed.phone) phoneInput.value = parsed.phone;
      if (parsed.email) emailInput.value = parsed.email;
    } catch (err) {
      console.error("❌ Error OCR:", err);
      ocrStatus.textContent =
        "Error al realizar el OCR. Prueba con más luz o foto más cercana.";
    }
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
      saveStatus.textContent = "Rellena algún campo (nombre, teléfono o email).";
      return;
    }

    saveStatus.textContent = "Guardando...";

    let imageUrl = null;

    // Subir imagen si existe
    if (currentImageDataUrl) {
      try {
        const id = Date.now();
        const storagePath = `cards-images/${id}.jpg`;
        const imageRef = ref(storage, storagePath);
        await uploadString(imageRef, currentImageDataUrl, "data_url");
        imageUrl = await getDownloadURL(imageRef);
      } catch (err) {
        console.error("Error subiendo imagen:", err);
        saveStatus.textContent = "Error subiendo la imagen.";
        return;
      }
    }

    try {
      await addDoc(collection(db, "cards"), {
        userId: currentUser.uid,
        name,
        company,
        phone,
        email,
        notes,
        imageUrl,
        createdAt: serverTimestamp(),
      });

      saveStatus.textContent = "Tarjeta guardada correctamente.";

      await loadCards(currentUser.uid);
      renderCards(cardsList);
    } catch (err) {
      console.error("Error guardando tarjeta:", err);
      saveStatus.textContent = "Error guardando la tarjeta.";
    }
  };

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

// --------- FUNCIONES AUXILIARES ---------

async function loadCards(uid) {
  cards = [];
  const q = query(collection(db, "cards"), where("userId", "==", uid));
  const snap = await getDocs(q);
  snap.forEach((doc) => cards.push({ id: doc.id, ...doc.data() }));
}

function renderCards(container) {
  container.innerHTML = "";

  if (!currentUser) {
    container.innerHTML = "<p>Inicia sesión para ver tus tarjetas.</p>";
    return;
  }

  if (!cards.length) {
    container.innerHTML = "<p>No hay tarjetas guardadas todavía.</p>";
    return;
  }

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

    container.appendChild(div);
  });
}

// Rotar la imagen 90º usando canvas
function rotateDataUrl90(dataUrl) {
  return new Promise((resolve, reject) => {
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
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// OCR REAL con Tesseract
async function performRealOCR(dataUrl) {
  if (!window.Tesseract) {
    throw new Error("Tesseract no está cargado.");
  }

  const { data } = await Tesseract.recognize(dataUrl, "eng", {
    logger: (m) => console.log("Tesseract:", m),
  });

  return data.text || "";
}

// Parsear texto de tarjeta
function parseBusinessCardText(text) {
  const result = { name: "", company: "", phone: "", email: "" };
  if (!text) return result;

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
  const phoneRegex = /(\+?\d[\d\s().-]{7,}\d)/;

  for (const line of lines) {
    if (!result.email && emailRegex.test(line)) {
      result.email = line.match(emailRegex)[0];
    }
    if (!result.phone && phoneRegex.test(line)) {
      result.phone = line.match(phoneRegex)[1];
    }
  }

  // Nombre: primera línea que no sea email ni teléfono
  result.name =
    lines.find(
      (l) => l && !emailRegex.test(l) && !phoneRegex.test(l) && l.length < 40
    ) || "";

  // Empresa: línea siguiente a la del nombre (si no es email/teléfono)
  const nameIndex = lines.indexOf(result.name);
  if (nameIndex >= 0 && nameIndex + 1 < lines.length) {
    const maybeCompany = lines[nameIndex + 1];
    if (!emailRegex.test(maybeCompany) && !phoneRegex.test(maybeCompany)) {
      result.company = maybeCompany;
    }
  }

  return result;
}
