<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Escáner de Tarjetas de Visita</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="styles.css" />
</head>

<body>
  <header class="app-header">
    <h1>Tarjetas de Visita</h1>
    <p>Escanea tarjetas, guarda contactos y gestiona tu red de forma sencilla.</p>

    <!-- Botón para configurar la API key -->
    <div style="margin-top:0.75rem;">
      <button class="btn primary-btn" onclick="configurarApiKey()">
        Configurar API Key de Firebase
      </button>
    </div>

    <div class="auth-bar">
      <div class="auth-user" id="authUserInfo" hidden>
        <img id="userAvatar" class="auth-avatar" alt="avatar" />
        <div class="auth-text">
          <span id="userName"></span>
          <span id="userEmail"></span>
        </div>
        <button id="logoutButton" class="btn small-btn secondary-btn">
          Cerrar sesión
        </button>
      </div>

      <div id="auth
