import { render } from "preact"
import { App } from "./App"
import "./styles.css"

render(<App />, document.getElementById("app")!)

// iOS Safari включает :active (отклик кнопок на нажатие) только если на странице есть обработчик касаний
document.addEventListener("touchstart", () => {}, { passive: true })

// Запуск не ждёт сети: новая оболочка скачивается в фоне и применяется после закрытия всех окон приложения.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch(() => {
        // Без сети или при недоступном сервере продолжаем работать с сохранённой оболочкой.
      })
  })
}
