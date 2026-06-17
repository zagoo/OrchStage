import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './styles/main.css'
import { useConnectionStore } from './stores/connection'
import { useUiStore } from './stores/ui'

const app = createApp(App)
app.use(createPinia())

// Hydrate persisted connection + theme BEFORE the router mounts so navigation
// guards can read the connection state and the correct theme paints on first frame.
useConnectionStore().hydrate()
useUiStore().hydrate()

app.use(router)
app.mount('#app')
