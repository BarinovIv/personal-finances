import { render } from "preact"
import { App } from "./App"
import "./styles.css"

render(<App />, document.getElementById("app")!)

// Оболочка из кэша: приложение открывается без сети. Новая версия ставится в фоне и открывается со следующего запуска.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js")
  })
}
