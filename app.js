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
let currentImageDataUrl = null;
let cards = [];
let dashboardVisible = false;

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
  const positionInput = document.getElementById("positionInput");
  const phoneInput = document.getElementById("phoneInput");
  const emailInput = document.getElementById("emailInput");
  const websiteInput = document.getElementById("websiteInput");
  const regionInput = document.getElementById("regionInput");
  const categoryInput = document.getElementById("categoryInput");
  const notesInput = document.getElementById("notesInput");
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

    ocrStatus.textContent = "Leyendo texto (OCR real)...";
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
      if (parsed.position) positionInput.value = parsed.position;
      if (parsed.phone) phoneInput.value = parsed.phone;
      if (parsed.email) emailInput.value = parsed.email;
      if (parsed.website) websiteInput.value = parsed.website;
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

    saveStatus.textContent = "Guardando...";

    let imageUrl = null;
    let storagePath = null;

    // Subir imagen si existe
    if (currentImageDataUrl) {
      try {
        const id = Date.now();
        storagePath = `cards-images/${id}.jpg`;
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
        imageUrl,
        storagePath,
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
        imageUrl,
        storagePath,
      });

      renderCards(cardsList);
      if (dashboardVisible) buildDashboard(dashboardContent);
    } catch (err) {
      console.error("Error guardando tarjeta:", err);
      saveStatus.textContent = "Error guardando la tarjeta.";
    }
  };

  // --- BORRAR TARJETA (delegación de eventos) ---
  cardsList.addEventListener("click", async (event) => {
    const btn = event.target.closest(".delete-btn");
    if (!btn) return;

    const cardEl = btn.closest(".saved-card");
    if (!cardEl) return;

    const cardId = cardEl.dataset.id;
    const storagePath = cardEl.dataset.storagePath || null;

    if (!cardId) return;

    const ok = confirm("¿Seguro que quieres borrar esta tarjeta?");
    if (!ok) return;

    try {
      await deleteDoc(doc(db, "cards", cardId));

      if (storagePath) {
        try {
          await deleteObject(ref(storage, storagePath));
        } catch (e) {
          console.error("Error borrando imagen de Storage (continuo):", e);
        }
      }

      cards = cards.filter((c) => c.id !== cardId);
      renderCards(cardsList);
      if (dashboardVisible) buildDashboard(dashboardContent);
    } catch (err) {
      console.error("Error borrando tarjeta:", err);
      alert("Error al borrar la tarjeta.");
    }
  });

  // --- TOGGLE DASHBOARD (solo escritorio) ---
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
    div.dataset.storagePath = card.storagePath || "";

    const regionText = card.region ? ` · ${card.region}` : "";
    const catText = card.category ? ` · ${card.category}` : "";
    const posText = card.position ? ` · ${card.position}` : "";
    const webText = card.website ? ` · ${card.website}` : "";

    div.innerHTML = `
      <div class="saved-card-thumbnail">
        ${card.imageUrl ? `<img src="${card.imageUrl}" />` : "T"}
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

// Construir dashboard con análisis (incluyendo agrupación por empresa)
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

  // Vertical principal
  let topCategory = null;
  let topCategoryCount = 0;
  for (const [cat, count] of Object.entries(byCategory)) {
    if (count > topCategoryCount) {
      topCategory = cat;
      topCategoryCount = count;
    }
  }

  // Región principal
  let topRegion = null;
  let topRegionCount = 0;
  for (const [reg, count] of Object.entries(byRegion)) {
    if (count > topRegionCount) {
      topRegion = reg;
      topRegionCount = count;
    }
  }

  // Empresa con más contactos
  let topCompany = null;
  let topCompanyCount = 0;
  for (const [comp, count] of Object.entries(byCompany)) {
    if (count > topCompanyCount) {
      topCompany = comp;
      topCompanyCount = count;
    }
  }

  let html = "";

  // Bloque resumen general + análisis
  html += `<div class="dashboard-block">
    <h3>Resumen general</h3>
    <p>Total tarjetas: <strong>${total}</strong></p>
    <p style="margin-top:0.4rem;font-size:0.8rem;color:#9ca3af;">
      ${
        topCategory
          ? `Tu vertical más frecuente es <strong>${topCategory}</strong> con <strong>${topCategoryCount}</strong> contactos.`
          : ""
      }
      ${
        topRegion
          ? `<br/>La zona donde más tarjetas tienes es <strong>${topRegion}</strong> con <strong>${topRegionCount}</strong> contactos.`
          : ""
      }
      ${
        topCompany
          ? `<br/>La empresa donde más contactos tienes es <strong>${topCompany}</strong> con <strong>${topCompanyCount}</strong> personas distintas.`
          : ""
      }
    </p>
  </div>`;

  // Bloque por tipo de contacto
  html += `<div class="dashboard-block">
    <h3>Por tipo de contacto</h3>
    <ul class="dashboard-list">
      ${Object.entries(byCategory)
        .map(([cat, count]) => `<li>${cat}: <strong>${count}</strong></li>`)
        .join("")}
    </ul>
  </div>`;

  // Bloque por zona / región
  html += `<div class="dashboard-block">
    <h3>Por zona / región</h3>
    <ul class="dashboard-list">
      ${Object.entries(byRegion)
        .map(([reg, count]) => `<li>${reg}: <strong>${count}</strong></li>`)
        .join("")}
    </ul>
  </div>`;

  // Bloque por empresa
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

  const { data } = await Tesseract.recognize(dataUrl, "eng+spa", {
    logger: (m) => console.log("Tesseract:", m),
  });

  return data.text || "";
}

// Parser mejorado de texto de tarjeta
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

  // Normalizamos espacios
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

  // 1) EMAIL, TELÉFONO, WEB
  for (const line of lines) {
    if (!result.email && emailRegex.test(line)) {
      result.email = line.match(emailRegex)[0];
    }
    if (!result.phone && phoneRegex.test(line)) {
      result.phone = line.match(phoneRegex)[1].trim();
    }
    if (!result.website && urlRegex.test(line)) {
      let w = line.match(urlRegex)[0].trim();
      // Añadimos https si no viene
      if (!/^https?:\/\//i.test(w)) {
        w = "https://" + w;
      }
      result.website = w;
    }
  }

  // 2) CARGO (posición)
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

  // 3) Posible empresa: líneas con S.L., S.A., GROUP, ARQUITECTOS, INGENIERÍA…
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
    // Si hay varias, cogemos la más larga
    candidateCompanies.sort((a, b) => b.length - a.length);
    result.company = candidateCompanies[0];
  }

  // 4) Si no hemos encontrado empresa, buscamos línea en mayúsculas que no sea email/tel/web
  if (!result.company) {
    const upperLines = lines.filter(
      (l) =>
        isUpper(l) &&
        !emailRegex.test(l) &&
        !phoneRegex.test(l) &&
        !urlRegex.test(l)
    );
    if (upperLines.length > 0) {
      // La más larga suele ser la empresa
      upperLines.sort((a, b) => b.length - a.length);
      result.company = upperLines[0];
    }
  }

  // 5) Nombre: línea que no sea email/tel/web, no tenga keywords de empresa,
  // no esté toda en mayúsculas y tenga 2–4 palabras con mayúsculas iniciales.
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

  // 6) Si no hay empresa y tenemos nombre, probamos línea anterior o posterior
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
