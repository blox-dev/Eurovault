console.log(localStorage);

document.getElementById("backBtn").onclick = () => {
  localStorage.setItem("step", "1");
  window.location.reload(); // reload index.html and load step1
};
