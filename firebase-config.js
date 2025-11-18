<!-- firebase-config.js -->
<script>
  // Función para obtener la API key desde el navegador
  function getFirebaseApiKey() {
    let key = localStorage.getItem('firebaseApiKey');

    if (!key) {
      key = window.prompt('Introduce tu API key de Firebase:');

      if (!key) {
        alert('Es necesaria una API key para continuar.');
        throw new Error('Firebase API key missing');
      }

      localStorage.setItem('firebaseApiKey', key.trim());
    }

    return key;
  }

  // Función global para obtener toda la configuración de Firebase
  window.getFirebaseConfig = function () {
    return {
      apiKey: getFirebaseApiKey(),
      authDomain: "escaner-tarjetas.firebaseapp.com",
      projectId: "escaner-tarjetas",
      storageBucket: "escaner-tarjetas.firebasestorage.app",
      messagingSenderId: "879669401384",
      appId: "1:879669401384:web:33a94e2e77610120b0221d"
      // Pon aquí el resto de campos de tu config de Firebase,
      // excepto la apiKey, que ya la ponemos arriba.
    };
  };

  // Función opcional para borrar la API key guardada
  window.clearFirebaseApiKey = function () {
    localStorage.removeItem('firebaseApiKey');
    alert('API key borrada. Se te volverá a pedir al recargar la página.');
  };
</script>
