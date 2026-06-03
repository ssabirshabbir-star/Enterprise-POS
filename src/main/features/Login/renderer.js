const stage = document.getElementById("loginStage");
const username = document.getElementById("username");
const password = document.getElementById("password");
const eyeToggle = document.getElementById("eyeToggle");
const rememberCheck = document.getElementById("rememberCheck");
const forgotPassword = document.getElementById("forgotPassword");
const loginBtn = document.getElementById("loginBtn");
const staffLogin = document.getElementById("staffLogin");
const biometricLogin = document.getElementById("biometricLogin");
const qrLogin = document.getElementById("qrLogin");

window.addEventListener("DOMContentLoaded", () => {
  username.focus();
});

eyeToggle.addEventListener("click", () => {
  password.type = password.type === "password" ? "text" : "password";
  password.focus();
});

function handleLogin() {
  const data = {
    username: username.value.trim(),
    password: password.value,
    rememberMe: rememberCheck.checked
  };

  if (!data.username || !data.password) {
    alert("Please enter username and password.");
    return;
  }

  console.log("Login data:", data);
}

loginBtn.addEventListener("click", handleLogin);

[username, password].forEach((input) => {
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();

    if (input === username && !password.value) {
      password.focus();
      return;
    }

    handleLogin();
  });
});

forgotPassword.addEventListener("click", () => {
  alert("Forgot password clicked.");
});

staffLogin.addEventListener("click", () => {
  alert("Staff Login clicked.");
});

biometricLogin.addEventListener("click", () => {
  alert("Biometric login is ready for device integration.");
});

qrLogin.addEventListener("click", () => {
  alert("QR Login is ready for device integration.");
});

document.addEventListener("keydown", (event) => {
  const zoomKeys = ["+", "=", "-", "_", "0"];
  if (event.ctrlKey && zoomKeys.includes(event.key)) {
    event.preventDefault();
    return;
  }

  if (event.key === "Enter") {
    handleLogin();
  }

  if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "d") {
    stage.classList.toggle("debug");
  }
});

window.addEventListener("wheel", (event) => {
  if (event.ctrlKey) {
    event.preventDefault();
  }
}, { passive: false });
