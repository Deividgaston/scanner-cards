// app.js (versión Firebase, proyecto independiente)

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
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadString,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

// ----- Inicializar Firebase -----
// Suponiendo que ya has cargado los scripts de Firebase antes
const firebaseConfig = window.getFirebaseConfig();
const app = firebase.initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// ----- Estado en memoria -----
let currentImageDataUrl = null;
let cards = [];

// ----- Selectores -----
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

// ----- Al cargar la página: leer tarjetas de Firestore -----
document.addEventListener("DOMContentLoaded", async () => {
  await loadCardsFromFirestore();
  renderCardsList();
});

// ----- Manejo de imagen -----
imageInput.addEventListener("change", handleImageSelected);

function handleImageSelected(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    currentImageDataUrl = e.target.result;
    imagePreview.src = currentImageDataUrl;
    imagePreviewContainer.classList.remove("hidden");
    scanButton.disabled = false;
    ocrStatus.textContent =
      "Imagen cargada. Pulsa en escanear para extraer los datos.";
  };
  reader.readAsDataURL(file);
}

// ----- Botón OCR -----
scanButton.addEventListener("click", async () => {
  if (!currentImageDataUrl) return;

  ocrStatus.textContent = "Procesando OCR, espera un momento...";
  scanButton.disabled = true;

  try {
    // Sustituye esta función por tu OCR real (como en la otra app)
    const text = await performFakeOCR(currentImageDataUrl);

    ocrStatus.textContent =
      "OCR completado. Rellena o corrige los datos antes de guardar.";

    const parsed = parseBusinessCardText(text);

    if (!nameInput.value) nameInput.value = parsed.name || "";
    if (!companyInput.value) companyInput.value = parsed.company || "";
    if (!phoneInput.value) phoneInput.value = parsed.phone || "";
    if (!emailInput.value) emailInput.value = parsed.email || "";
    if (!notesInput.value) notesInput.value = parsed.notes || "";
  } catch (error) {
    console.error(error);
    ocrStatus.textContent = "Error al procesar el OCR. Inténtalo de nuevo.";
  } finally {
    scanButton.disabled = false;
  }
});

// ----- Guardar contacto (Firestore + Storage) -----
saveContactButton.addEventListener("click", async () => {
  const name = nameInput.value.trim();
  const company = companyInput.value.trim();
  const phone = phoneInput.value.trim();
  const email = emailInput.value.trim();
  const notes = notesInput.value.trim();

  if (!name && !phone && !email) {
    saveStatus.textContent =
      "Introduce al menos un nombre, teléfono o email para guardar.";
    return;
  }

  const normalizedPhone = normalizePhone(phone);
  const normalizedEmail = email.toLowerCase();

  // Buscar duplicados en el array local (ya viene de Firestore)
  const existingIndex = cards.findIndex((card) => {
    const cPhone = normalizePhone(card.phone || "");
    const cEmail = (card.email || "").toLowerCase();
    return (
      (normalizedPhone && cPhone && cPhone === normalizedPhone) ||
      (normalizedEmail && cEmail && cEmail === normalizedEmail)
    );
  });

  try {
    saveStatus.textContent = "Guardando tarjeta...";
    saveContactButton.disabled = true;

    let imageUrl = null;
    let storagePath = null;

    // Si hay imagen, la subimos a Storage
    if (currentImageDataUrl) {
      // Si actualizamos, intentamos reutilizar el mismo path
      const idForImage =
        existingIndex !== -1 ? cards[existingIndex].id : Date.now().toString();

      storagePath = `cards-images/${idForImage}.jpg`;
      const imageRef = ref(storage, storagePath);

      // currentImageDataUrl es un dataURL (base64), usamos uploadString
      await uploadString(imageRef, currentImageDataUrl, "data_url");
      imageUrl = await getDownloadURL(imageRef);
    } else if (existingIndex !== -1) {
      // Si no hay nueva imagen pero actualizamos, mantenemos la anterior
      imageUrl = cards[existingIndex].imageUrl || null;
      storagePath = cards[existingIndex].storagePath || null;
    }

    if (existingIndex !== -1) {
      // Actualizar tarjeta existente en Firestore
      const existing = cards[existingIndex];

      const confirmUpdate = confirm(
        `Ya existe una tarjeta con ese teléfono o email:\n\n` +
          `Nombre: ${existing.name || "-"}\n` +
          `Empresa: ${existing.company || "-"}\n\n` +
          `¿Quieres actualizarla con los nuevos datos?`
      );

      if (!confirmUpdate) {
        saveStatus.textContent = "Tarjeta no guardada para evitar duplicado.";
        return;
      }

      const docRef = doc(db, "cards", existing.id);
      await updateDoc(docRef, {
        name,
        company,
        phone,
        email,
        notes,
        imageUrl: imageUrl || null,
        storagePath: storagePath || null,
        updatedAt: serverTimestamp(),
      });

      // Actualizar en el array local
      cards[existingIndex] = {
        ...existing,
        name,
        company,
        phone,
        email,
        notes,
        imageUrl: imageUrl || null,
        storagePath: storagePath || null,
      };

      saveStatus.textContent = "Tarjeta actualizada correctamente.";
    } else {
      // Crear nueva tarjeta en Firestore
      const newData = {
        name,
        company,
        phone,
        email,
        notes,
        imageUrl: imageUrl || null,
        storagePath: storagePath || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const docRef = await addDoc(collection(db, "cards"), newData);

      // Añadir al array local
      cards.unshift({
        id: docRef.id,
        ...newData,
      });

      saveStatus.textContent = "Tarjeta guardada correctamente.";
    }

    renderCardsList();
    clearForm(false);
  } catch (error) {
    console.error(error);
    saveStatus.textContent = "Error al guardar la tarjeta.";
  } finally {
    saveContactButton.disabled = false;
  }
});

// ----- Leer tarjetas desde Firestore -----
async function loadCardsFromFirestore() {
  try {
    const snapshot = await getDocs(collection(db, "cards"));
    const list = [];
    snapshot.forEach((docSnap) => {
      list.push({
        id: docSnap.id,
        ...docSnap.data(),
      });
    });

    // Orden aproximado por fecha de creación (si no la hay, lo dejamos tal cual)
    list.sort((a, b) => {
      const aTime = a.createdAt?.seconds || 0;
      const bTime = b.createdAt?.seconds || 0;
      return bTime - aTime;
    });

    cards = list;
  } catch (error) {
    console.error("Error al cargar tarjetas:", error);
    cards = [];
  }
}

// ----- Render listado -----
function renderCardsList() {
  if (!cards.length) {
    cardsList.innerHTML =
      '<p style="font-size:0.85rem;color:#6b7280;">No hay tarjetas guardadas todavía.</p>';
    return;
  }

  cardsList.innerHTML = "";

  cards.forEach((card) => {
    const div = document.createElement("div");
    div.className = "saved-card";

    const thumb = document.createElement("div");
    thumb.className = "saved-card-thumbnail";
    if (card.imageUrl) {
      const img = document.createElement("img");
      img.src = card.imageUrl;
      img.alt = card.name || "Tarjeta";
      thumb.appendChild(img);
    } else {
      thumb.textContent = "T";
    }

    const content = document.createElement("div");
    content.className = "saved-card-content";

    const title = document.createElement("div");
    title.className = "saved-card-title";
    title.textContent = card.name || "(Sin nombre)";

    const subtitle = document.createElement("div");
    subtitle.className = "saved-card-subtitle";
    subtitle.textContent = card.company || "";

    const meta = document.createElement("div");
    meta.className = "saved-card-meta";
    const phonePart = card.phone ? `📞 ${card.phone}` : "";
    const emailPart = card.email ? ` · ✉️ ${card.email}` : "";
    meta.textContent = phonePart + emailPart;

    content.appendChild(title);
    content.appendChild(subtitle);
    content.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "saved-card-actions";

    const btnLoad = document.createElement("button");
    btnLoad.className = "btn small-btn secondary-btn";
    btnLoad.textContent = "Editar";
    btnLoad.addEventListener("click", () => loadCardIntoForm(card.id));

    const btnExport = document.createElement("button");
    btnExport.className = "btn small-btn primary-btn";
    btnExport.textContent = "Guardar en contactos";
    btnExport.addEventListener("click", () => exportAsVCard(card));

    actions.appendChild(btnLoad);
    actions.appendChild(btnExport);

    div.appendChild(thumb);
    div.appendChild(content);
    div.appendChild(actions);

    cardsList.appendChild(div);
  });
}

// ----- Cargar tarjeta en formulario -----
function loadCardIntoForm(cardId) {
  const card = cards.find((c) => c.id === cardId);
  if (!card) return;

  nameInput.value = card.name || "";
  companyInput.value = card.company || "";
  phoneInput.value = card.phone || "";
  emailInput.value = card.email || "";
  notesInput.value = card.notes || "";

  if (card.imageUrl) {
    currentImageDataUrl = null; // no tenemos el dataURL original, pero no pasa nada
    imagePreview.src = card.imageUrl;
    imagePreviewContainer.classList.remove("hidden");
    scanButton.disabled = false;
  } else {
    currentImageDataUrl = null;
    imagePreview.src = "";
    imagePreviewContainer.classList.add("hidden");
    scanButton.disabled = true;
  }

  saveStatus.textContent =
    "Tarjeta cargada en el formulario. Modifica y guarda para actualizar.";
}

// ----- Exportar a VCard (.vcf) -----
function exportAsVCard(card) {
  const name = card.name || "";
  const company = card.company || "";
  const phone = card.phone || "";
  const email = card.email || "";

  let vcard = "BEGIN:VCARD\nVERSION:3.0\n";
  if (name) vcard += `FN:${name}\n`;
  if (company) vcard += `ORG:${company}\n`;
  if (phone) vcard += `TEL;TYPE=CELL:${phone}\n`;
  if (email) vcard += `EMAIL;TYPE=INTERNET:${email}\n`;
  vcard += "END:VCARD";

  const blob = new Blob([vcard], { type: "text/vcard;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  const safeName = name || "contacto";
  a.download = `${safeName.replace(/\s+/g, "_")}.vcf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ----- Utilidades -----
function clearForm(clearImage = true) {
  // Aquí si quieres puedes limpiar los campos de texto
  // nameInput.value = "";
  // companyInput.value = "";
  // phoneInput.value = "";
  // emailInput.value = "";
  // notesInput.value = "";

  if (clearImage) {
    currentImageDataUrl = null;
    imagePreview.src = "";
    imagePreviewContainer.classList.add("hidden");
    scanButton.disabled = true;
    ocrStatus.textContent = "";
  }
}

function normalizePhone(phone) {
  return (phone || "").replace(/\D+/g, "");
}

// ----- OCR falso (para pruebas) -----
async function performFakeOCR(imageDataUrl) {
  await new Promise((res) => setTimeout(res, 1200));

  const fakeText = `
    Nombre Apellido
    Cargo
    Empresa Ejemplo
    Tel: +34 600 123 456
    Email: ejemplo@empresa.com
  `;
  return fakeText;
}

// ----- Parser sencillo del texto OCR -----
function parseBusinessCardText(text) {
  const result = {
    name: "",
    company: "",
    phone: "",
    email: "",
    notes: "",
  };

  if (!text) return result;

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;
  const phoneRegex = /(\+?\d[\d\s\-\(\)]{6,}\d)/;

  for (const line of lines) {
    const emailMatch = line.match(emailRegex);
    if (emailMatch && !result.email) {
      result.email = emailMatch[1];
    }

    const phoneMatch = line.match(phoneRegex);
    if (phoneMatch && !result.phone) {
      result.phone = phoneMatch[1];
    }
  }

  if (lines.length > 0) {
    const first = lines[0];
    if (!emailRegex.test(first) && first.split(" ").length >= 2) {
      result.name = first;
    }
  }

  for (let i = 1; i < Math.min(lines.length, 4); i++) {
    const line = lines[i];
    if (
      !emailRegex.test(line) &&
      !phoneRegex.test(line) &&
      !line.toLowerCase().startsWith("tel") &&
      !line.toLowerCase().startsWith("mov") &&
      !line.toLowerCase().startsWith("phone") &&
      !line.toLowerCase().startsWith("email")
    ) {
      result.company = line;
      break;
    }
  }

  return result;
}
