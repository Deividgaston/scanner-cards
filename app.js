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
  doc,
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadString,
  getDownloadURL,
  deleteObject,
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
let frontImageDataUrl = null;
let backImageDataUrl = null;
let cards = [];
let dashboardVisible = false;

// Referencias globales a inputs y panel OCR
let nameInput,
  companyInput,
  positionInput,
  phoneInput,
  emailInput,
  websiteInput,
  regionInput,
  categoryInput,
  notesInput,
  ocrLinesContainer,
  ocrStatusGlobal;

const GEMINI_MODEL = "gemini-2.5-flash";

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

  const frontImageInput = document.getElementById("frontImageInput");
  const frontImagePreview = document.getElementById("frontImagePreview");
  const frontImagePreviewContainer = document.getElementById(
    "frontImagePreviewContainer"
  );

  const backImageInput = document.getElementById("backImageInput");
  const backImagePreview = document.getElementById("backImagePreview");
  const backImagePreviewContainer = document.getElementById(
    "backImagePreviewContainer"
  );

  const rotateFrontButton = document.getElementById("rotateFrontButton");
  const rotateBackButton = document.getElementById("rotateBackButton");
  const scanButton = document.getElementById("scanButton");
  const ocrStatus = document.getElementById("ocrStatus");
  ocrStatusGlobal = ocrStatus;

  // Inputs de datos
  nameInput = document.getElementById("nameInput");
  companyInput = document.getElementById("companyInput");
  positionInput = document.getElementById("positionInput");
  phoneInput = document.getElementById("phoneInput");
  emailInput = document.getElementById("emailInput");
  websiteInput = document.getElementById("websiteInput");
  regionInput = document.getElementById("regionInput");
  categoryInput = document.getElementById("categoryInput");
  notesInput = document.getElementById("notesInput");
  ocrLinesContainer = document.getElementById("ocrLinesContainer");

  const saveContactButton = document.getElementById("saveContactButton");
  const saveStatus = document.getElementById("saveStatus");

  const cardsList = document.getElementById("cardsList");

  const dashboardToggleButton = document.getElementById("dashboardToggleButton");
  const dashboardSection = document.getElementById("dashboardSection");
  const dashboardContent = document.getElementById("dashboardContent");

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
      dashboardSection.classList.add("hidden");
      dashboardVisible = false;
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

  // --- SUBIR IMAGEN FRONTAL ---
  frontImageInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      frontImageDataUrl = ev.target.result;
      frontImagePreview.src = frontImageDataUrl;
      frontImagePreviewContainer.classList.remove("hidden");

      rotateFrontButton.disabled = false;
      if (frontImageDataUrl && backImageDataUrl) {
        scanButton.disabled = false;
      }
      ocrStatus.textContent = "Cara frontal cargada.";
    };
    reader.readAsDataURL(file);
  };

  // --- SUBIR IMAGEN TRASERA ---
  backImageInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      backImageDataUrl = ev.target.result;
      backImagePreview.src = backImageDataUrl;
      backImagePreviewContainer.classList.remove("hidden");

      rotateBackButton.disabled = false;
      if (frontImageDataUrl && backImageDataUrl) {
        scanButton.disabled = false;
      }
      ocrStatus.textContent = "Cara trasera cargada.";
    };
    reader.readAsDataURL(file);
  };

  // --- ROTAR FRONTAL 90º ---
  rotateFrontButton.onclick = async () => {
    if (!frontImageDataUrl) return;
    try {
      frontImageDataUrl = await rotateDataUrl90(frontImageDataUrl);
      frontImagePreview.src = frontImageDataUrl;
      ocrStatus.textContent = "Cara frontal rotada 90º.";
    } catch (err) {
      console.error("Error rotando frontal:", err);
      ocrStatus.textContent = "Error al rotar la cara frontal.";
    }
  };

  // --- ROTAR TRASERA 90º ---
  rotateBackButton.onclick = async () => {
    if (!backImageDataUrl) return;
    try {
      backImageDataUrl = await rotateDataUrl90(backImageDataUrl);
      backImagePreview.src = backImageDataUrl;
      ocrStatus.textContent = "Cara trasera rotada 90º.";
    } catch (err) {
      console.error("Error rotando trasera:", err);
      ocrStatus.textContent = "Error al rotar la cara trasera.";
    }
  };

  // --- ESCANEAR CON GEMINI (2.5 Flash) ---
  scanButton.onclick = async () => {
    if (!frontImageDataUrl || !backImageDataUrl) {
      ocrStatus.textContent = "Haz las dos fotos (frontal y trasera) antes de escanear.";
      return;
    }

    ocrStatus.textContent = "Enviando imágenes a Gemini 2.5 Flash...";
    console.log("🔍 Gemini OCR (frontal + trasera)");

    try {
      const { parsed, rawText } = await callGeminiForCard(
        frontImageDataUrl,
        backImageDataUrl
      );

      if (rawText) {
        renderOcrLinesPanel(rawText);
      } else {
        ocrLinesContainer.innerHTML =
          "<p>No se han podido obtener líneas de texto.</p>";
      }

      if (parsed) {
        if (parsed.name) nameInput.value = parsed.name;
        if (parsed.company) companyInput.value = parsed.company;
        if (parsed.position) positionInput.value = parsed.position;
        if (parsed.phone) phoneInput.value = parsed.phone;
        if (parsed.email) emailInput.value = parsed.email;
        if (parsed.website) websiteInput.value = parsed.website;
        if (parsed.region) regionInput.value = parsed.region;
        if (parsed.category) categoryInput.value = parsed.category;
        if (parsed.notes) notesInput.value = parsed.notes;

        ocrStatus.textContent =
          "Gemini ha rellenado los campos. Revisa y ajusta si hace falta.";
      } else {
        ocrStatus.textContent =
          "Gemini devolvió texto no estructurado. He intentado interpretarlo.";
        const fallback = parseBusinessCardText(rawText || "");
        if (fallback.name) nameInput.value = fallback.name;
        if (fallback.company) companyInput.value = fallback.company;
        if (fallback.position) positionInput.value = fallback.position;
        if (fallback.phone) phoneInput.value = fallback.phone;
        if (fallback.email) emailInput.value = fallback.email;
        if (fallback.website) websiteInput.value = fallback.website;
      }
    } catch (err) {
      console.error("❌ Error Gemini:", err);
      ocrStatus.textContent =
        "Error al llamar a Gemini: " + (err.message || String(err));
    }
  };

  // --- GUARDAR CONTACTO ---
  saveContactButton.onclick = async () => {
    if (!currentUser) return;

    const name = nameInput.value.trim();
    const company = companyInput.value.trim();
    const position = positionInput.value.trim();
    const phone = phoneInput.value.trim();
    const email = emailInput.value.trim();
    const website = websiteInput.value.trim();
    const region = regionInput.value.trim();
    const category = categoryInput.value;
    const notes = notesInput.value.trim();

    if (!name && !phone && !email) {
      saveStatus.textContent = "Rellena algún campo (nombre, teléfono o email).";
      return;
    }

    if (!frontImageDataUrl || !backImageDataUrl) {
      saveStatus.textContent = "Debes tener las dos fotos (frontal y trasera).";
      return;
    }

    saveStatus.textContent = "Guardando...";

    let frontImageUrl = null;
    let backImageUrl = null;
    let frontStoragePath = null;
    let backStoragePath = null;

    // Subir imágenes a Firebase Storage
    try {
      const baseId = Date.now();

      // Frontal
      frontStoragePath = `cards-images/${baseId}-front.jpg`;
      const frontRef = ref(storage, frontStoragePath);
      await uploadString(frontRef, frontImageDataUrl, "data_url");
      frontImageUrl = await getDownloadURL(frontRef);

      // Trasera
      backStoragePath = `cards-images/${baseId}-back.jpg`;
      const backRef = ref(storage, backStoragePath);
      await uploadString(backRef, backImageDataUrl, "data_url");
      backImageUrl = await getDownloadURL(backRef);
    } catch (err) {
      console.error("Error subiendo imágenes:", err);
      saveStatus.textContent = "Error subiendo las imágenes a Firebase Storage.";
      return;
    }

    try {
      const docRef = await addDoc(collection(db, "cards"), {
        userId: currentUser.uid,
        name,
        company,
        position,
        phone,
        email,
        website,
        region,
        category,
        notes,
        frontImageUrl,
        backImageUrl,
        frontStoragePath,
        backStoragePath,
        createdAt: serverTimestamp(),
      });

      saveStatus.textContent = "Tarjeta guardada correctamente.";

      cards.unshift({
        id: docRef.id,
        userId: currentUser.uid,
        name,
        company,
        position,
        phone,
        email,
        website,
        region,
        category,
        notes,
        frontImageUrl,
        backImageUrl,
        frontStoragePath,
        backStoragePath,
      });

      renderCards(cardsList);
      if (dashboardVisible) buildDashboard(dashboardContent);
    } catch (err) {
      console.error("Error guardando tarjeta:", err);
      saveStatus.textContent = "Error guardando la tarjeta.";
    }
  };

  // --- BORRAR TARJETA ---
  cardsList.addEventListener("click", async (event) => {
    const btn = event.target.closest(".delete-btn");
    if (!btn) return;

    const cardEl = btn.closest(".saved-card");
    if (!cardEl) return;

    const cardId = cardEl.dataset.id;
    const frontStoragePath = cardEl.dataset.frontStoragePath || null;
    const backStoragePath = cardEl.dataset.backStoragePath || null;

    if (!cardId) return;

    const ok = confirm("¿Seguro que quieres borrar esta tarjeta?");
    if (!ok) return;

    try {
      await deleteDoc(doc(db, "cards", cardId));

      const deletions = [];
      if (frontStoragePath) {
        deletions.push(
          deleteObject(ref(storage, frontStoragePath)).catch((e) =>
            console.error("Error borrando frontal:", e)
          )
        );
      }
      if (backStoragePath) {
        deletions.push(
          deleteObject(ref(storage, backStoragePath)).catch((e) =>
            console.error("Error borrando trasera:", e)
          )
        );
      }
      await Promise.all(deletions);

      cards = cards.filter((c) => c.id !== cardId);
      renderCards(cardsList);
      if (dashboardVisible) buildDashboard(dashboardContent);
    } catch (err) {
      console.error("Error borrando tarjeta:", err);
      alert("Error al borrar la tarjeta.");
    }
  });

  // --- TOGGLE DASHBOARD ---
  if (dashboardToggleButton) {
    dashboardToggleButton.onclick = () => {
      console.log("📊 Click en botón dashboard");
      dashboardVisible = !dashboardVisible;
      if (dashboardVisible) {
        dashboardSection.classList.remove("hidden");
        dashboardToggleButton.textContent = "Ocultar dashboard";
        buildDashboard(dashboardContent);
        dashboardSection.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        dashboardSection.classList.add("hidden");
        dashboardToggleButton.textContent = "Ver dashboard";
      }
    };
  }

  function disableApp() {
    frontImageInput.disabled = true;
    backImageInput.disabled = true;
    scanButton.disabled = true;
    rotateFrontButton.disabled = true;
    rotateBackButton.disabled = true;
    saveContactButton.disabled = true;
  }

  function enableApp() {
    frontImageInput.disabled = false;
    backImageInput.disabled = false;
  }
});

// --------- FUNCIONES AUXILIARES ---------

async function loadCards(uid) {
  cards = [];
  const q = query(collection(db, "cards"), where("userId", "==", uid));
  const snap = await getDocs(q);
  snap.forEach((docSnap) => cards.push({ id: docSnap.id, ...docSnap.data() }));
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
    div.dataset.id = card.id;
    div.dataset.frontStoragePath = card.frontStoragePath || "";
    div.dataset.backStoragePath = card.backStoragePath || "";

    const regionText = card.region ? ` · ${card.region}` : "";
    const catText = card.category ? ` · ${card.category}` : "";
    const posText = card.position ? ` · ${card.position}` : "";
    const webText = card.website ? ` · ${card.website}` : "";

    div.innerHTML = `
      <div class="saved-card-thumbnail">
        ${
          card.frontImageUrl
            ? `<img src="${card.frontImageUrl}" />`
            : "T"
        }
      </div>
      <div class="saved-card-content">
        <div class="saved-card-title">${card.name || "Sin nombre"}</div>
        <div class="saved-card-subtitle">
          ${card.company || ""}${posText}
        </div>
        <div class="saved-card-meta">
          ${card.phone || ""} ${card.email ? " · " + card.email : ""}${regionText}${catText}${webText}
        </div>
      </div>
      <div class="saved-card-actions">
        <button class="btn small-btn secondary-btn delete-btn">Borrar</button>
      </div>
    `;

    container.appendChild(div);
  });
}

// Dashboard
function buildDashboard(container) {
  console.log("📊 Construyendo dashboard con", cards.length, "tarjetas");

  if (!cards.length) {
    container.innerHTML = `
      <div class="dashboard-block">
        <h3>Sin datos</h3>
        <p>Todavía no hay tarjetas guardadas. Escanea algunas para ver el análisis.</p>
      </div>
    `;
    return;
  }

  const total = cards.length;

  const byCategory = {};
  const byRegion = {};
  const byCompany = {};

  cards.forEach((card) => {
    const cat = card.category || "Sin categoría";
    const reg = card.region || "Sin región";
    const comp = card.company || "Sin empresa";

    byCategory[cat] = (byCategory[cat] || 0) + 1;
    byRegion[reg] = (byRegion[reg] || 0) + 1;
    byCompany[comp] = (byCompany[comp] || 0) + 1;
  });

  let topCategory = null;
  let topCategoryCount = 0;
  for (const [cat, count] of Object.entries(byCategory)) {
    if (count > topCategoryCount) {
      topCategory = cat;
      topCategoryCount = count;
    }
  }

  let topRegion = null;
  let topRegionCount = 0;
  for (const [reg, count] of Object.entries(byRegion)) {
    if (count > topRegionCount) {
      topRegion = reg;
      topRegionCount = count;
    }
  }

  let topCompany = null;
  let topCompanyCount = 0;
  for (const [comp, count] of Object.entries(byCompany)) {
    if (count > topCompanyCount) {
      topCompany = comp;
      topCompanyCount = count;
    }
  }

  let html = "";

  html += `<div class="dashboard-block">
    <h3>Resumen general</h3>
    <p>Total tarjetas: <strong>${total}</strong></p>
    <p style="margin-top:0.4rem;font-size:0.8rem;color:#9ca3af;">
      ${
        topCategory
          ? `Vertical más frecuente: <strong>${topCategory}</strong> (${topCategoryCount} contactos).`
          : ""
      }
      ${
        topRegion
          ? `<br/>Zona con más contactos: <strong>${topRegion}</strong> (${topRegionCount}).`
          : ""
      }
      ${
        topCompany
          ? `<br/>Empresa con más contactos: <strong>${topCompany}</strong> (${topCompanyCount} personas).`
          : ""
      }
    </p>
  </div>`;

  html += `<div class="dashboard-block">
    <h3>Por tipo de contacto</h3>
    <ul class="dashboard-list">
      ${Object.entries(byCategory)
        .map(([cat, count]) => `<li>${cat}: <strong>${count}</strong></li>`)
        .join("")}
    </ul>
  </div>`;

  html += `<div class="dashboard-block">
    <h3>Por zona / región</h3>
    <ul class="dashboard-list">
      ${Object.entries(byRegion)
        .map(([reg, count]) => `<li>${reg}: <strong>${count}</strong></li>`)
        .join("")}
    </ul>
  </div>`;

  html += `<div class="dashboard-block">
    <h3>Por empresa (nº de contactos)</h3>
    <ul class="dashboard-list">
      ${Object.entries(byCompany)
        .map(([comp, count]) => `<li>${comp}: <strong>${count}</strong></li>`)
        .join("")}
    </ul>
  </div>`;

  container.innerHTML = html;
}

// Rotar imagen 90º
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

// Llamada a Gemini 2.5 Flash con dos imágenes
async function callGeminiForCard(frontDataUrl, backDataUrl) {
  const apiKey = localStorage.getItem("geminiApiKey");
  if (!apiKey) {
    throw new Error(
      "Gemini API key no configurada. Pulsa en 'Configurar API Key de Gemini'."
    );
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(
    apiKey
  )}`;

  const parts = [
    {
      text:
        "Analiza estas imágenes de una tarjeta de visita (frontal y trasera) " +
        "y devuelve SOLO un JSON válido con este formato exacto:\n" +
        "{\n" +
        '  "name": "",\n' +
        '  "company": "",\n' +
        '  "position": "",\n' +
        '  "phone": "",\n' +
        '  "email": "",\n' +
        '  "website": "",\n' +
        '  "region": "",\n' +
        '  "category": "",\n' +
        '  "notes": "",\n' +
        '  "raw_lines": ["..."]\n' +
        "}\n" +
        "No incluyas nada de texto fuera del JSON. " +
        "Si no conoces un campo, déjalo como cadena vacía. " +
        'En "raw_lines" pon una lista de líneas de texto relevantes extraídas de la tarjeta.',
    },
  ];

  const dataUrlToBase64 = (d) => {
    if (!d) return "";
    const parts = d.split(",");
    return parts.length > 1 ? parts[1] : parts[0];
  };

  if (frontDataUrl) {
    parts.push({
      inline_data: {
        mime_type: "image/jpeg",
        data: dataUrlToBase64(frontDataUrl),
      },
    });
  }

  if (backDataUrl) {
    parts.push({
      inline_data: {
        mime_type: "image/jpeg",
        data: dataUrlToBase64(backDataUrl),
      },
    });
  }

  const body = {
    contents: [
      {
        parts,
      },
    ],
  };

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`HTTP ${res.status}: ${errText}`);
  }

  const json = await res.json();
  const partsOut = json.candidates?.[0]?.content?.parts || [];
  const text = partsOut
    .map((p) => p.text || "")
    .join("\n")
    .trim();

  let parsed = null;
  let rawTextFromJson = "";

  if (text) {
    try {
      parsed = JSON.parse(text);
      if (Array.isArray(parsed.raw_lines)) {
        rawTextFromJson = parsed.raw_lines.join("\n");
      }
    } catch (e) {
      console.warn("No se pudo parsear JSON de Gemini, usando texto bruto", e);
    }
  }

  return { parsed, rawText: rawTextFromJson || text };
}

// Panel de líneas OCR
function renderOcrLinesPanel(text) {
  if (!ocrLinesContainer) return;

  ocrLinesContainer.innerHTML = "";

  if (!text) {
    ocrLinesContainer.innerHTML = "<p>No se detectaron líneas.</p>";
    return;
  }

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  lines.forEach((line) => {
    const div = document.createElement("div");
    div.className = "ocr-line-item";

    div.innerHTML = `
      <div class="ocr-line-text">${line}</div>
      <div class="ocr-line-buttons">
        <button class="btn small-btn" data-field="name">Nombre</button>
        <button class="btn small-btn" data-field="company">Empresa</button>
        <button class="btn small-btn" data-field="position">Cargo</button>
        <button class="btn small-btn" data-field="phone">Teléfono</button>
        <button class="btn small-btn" data-field="email">Email</button>
        <button class="btn small-btn" data-field="website">Web</button>
      </div>
    `;

    div.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const field = btn.dataset.field;

        if (field === "name") nameInput.value = line;
        if (field === "company") companyInput.value = line;
        if (field === "position") positionInput.value = line;
        if (field === "phone") phoneInput.value = line;
        if (field === "email") emailInput.value = line;
        if (field === "website") websiteInput.value = line;

        if (ocrStatusGlobal) {
          ocrStatusGlobal.textContent = `Asignado: ${field} = "${line}"`;
        }
      });
    });

    ocrLinesContainer.appendChild(div);
  });
}

// Parser de texto de tarjeta (fallback)
function parseBusinessCardText(text) {
  const result = {
    name: "",
    company: "",
    position: "",
    phone: "",
    email: "",
    website: "",
  };
  if (!text) return result;

  let lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  lines = lines.map((l) => l.replace(/\s+/g, " "));

  const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
  const phoneRegex = /(\+?\d[\d\s().\-]{7,}\d)/;
  const urlRegex =
    /\b(https?:\/\/)?([a-z0-9\-]+\.)+[a-z]{2,}(\/[^\s]*)?/i;

  const positionKeywords = [
    "director",
    "manager",
    "responsable",
    "sales",
    "comercial",
    "ceo",
    "cto",
    "cmo",
    "coo",
    "founder",
    "socio",
    "owner",
    "arquitecto",
    "architect",
    "ingeniero",
    "engineer",
    "project manager",
    "jefe de obra",
    "business development",
    "consultor",
    "consultant",
  ];

  const isUpper = (s) =>
    s.length > 0 &&
    s === s.toUpperCase() &&
    /[A-ZÁÉÍÓÚÑ]/.test(s);

  for (const line of lines) {
    if (!result.email && emailRegex.test(line)) {
      result.email = line.match(emailRegex)[0];
    }
    if (!result.phone && phoneRegex.test(line)) {
      result.phone = line.match(phoneRegex)[1].trim();
    }
    if (!result.website && urlRegex.test(line)) {
      let w = line.match(urlRegex)[0].trim();
      if (!/^https?:\/\//i.test(w)) {
        w = "https://" + w;
      }
      result.website = w;
    }
  }

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (
      positionKeywords.some((kw) => lower.includes(kw)) &&
      !emailRegex.test(line) &&
      !phoneRegex.test(line) &&
      !urlRegex.test(line)
    ) {
      result.position = line;
      break;
    }
  }

  const companyIndicators = [
    "s.l",
    "s.a",
    "sl",
    "sa",
    "group",
    "grupo",
    "arquitect",
    "ingenier",
    "construcciones",
    "promociones",
    "developers",
    "properties",
  ];

  let candidateCompanies = lines.filter((line) => {
    const lower = line.toLowerCase();
    return (
      !emailRegex.test(line) &&
      !phoneRegex.test(line) &&
      !urlRegex.test(line) &&
      companyIndicators.some((kw) => lower.includes(kw))
    );
  });

  if (candidateCompanies.length > 0) {
    candidateCompanies.sort((a, b) => b.length - a.length);
    result.company = candidateCompanies[0];
  }

  if (!result.company) {
    const upperLines = lines.filter(
      (l) =>
        isUpper(l) &&
        !emailRegex.test(l) &&
        !phoneRegex.test(l) &&
        !urlRegex.test(l)
    );
    if (upperLines.length > 0) {
      upperLines.sort((a, b) => b.length - a.length);
      result.company = upperLines[0];
    }
  }

  const looksLikeName = (line) => {
    if (!line) return false;
    if (emailRegex.test(line) || phoneRegex.test(line) || urlRegex.test(line))
      return false;
    if (isUpper(line)) return false;

    const tokens = line.split(" ");
    if (tokens.length < 2 || tokens.length > 4) return false;

    let capitalizedWords = 0;
    for (const t of tokens) {
      if (/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+$/.test(t)) {
        capitalizedWords++;
      }
    }
    return capitalizedWords >= 2;
  };

  const nameCandidate =
    lines.find((l) => looksLikeName(l)) || "";

  result.name = nameCandidate;

  if (!result.company && result.name) {
    const idx = lines.indexOf(result.name);
    if (idx >= 0) {
      const before = lines[idx - 1];
      const after = lines[idx + 1];

      const isValidCompanyLine = (line) =>
        line &&
        !emailRegex.test(line) &&
        !phoneRegex.test(line) &&
        !urlRegex.test(line) &&
        line.length <= 40;

      if (isValidCompanyLine(before)) {
        result.company = before;
      } else if (isValidCompanyLine(after)) {
        result.company = after;
      }
    }
  }

  return result;
}
