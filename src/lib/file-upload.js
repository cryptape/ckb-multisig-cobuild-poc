export function readAsText(file) {
  const reader = new FileReader();

  return new Promise((resolve, reject) => {
    reader.addEventListener("load", (loaded) => {
      resolve(loaded.target.result);
    });
    reader.addEventListener("error", reject);
    reader.addEventListener("abort", reject);

    reader.readAsText(file);
  });
}
