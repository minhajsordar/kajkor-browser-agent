import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "@/App.vue";
import router from "@/router";
import VueApexCharts from "vue3-apexcharts";
import { initAnalytics } from "@/boot/analytics";

import "@/assets/css/main.css";
// FILE: main.js
import { Quasar, Loading, Dialog, Notify, AppFullscreen } from "quasar";
// Import icon libraries
import "@quasar/extras/roboto-font/roboto-font.css";
import "@quasar/extras/material-icons/material-icons.css";
import "@quasar/extras/material-icons-outlined/material-icons-outlined.css";
import "@quasar/extras/material-icons-round/material-icons-round.css";
import "@quasar/extras/material-icons-sharp/material-icons-sharp.css";
import "@quasar/extras/material-symbols-outlined/material-symbols-outlined.css";
import "@quasar/extras/material-symbols-rounded/material-symbols-rounded.css";
import "@quasar/extras/material-symbols-sharp/material-symbols-sharp.css";
import "@quasar/extras/mdi-v7/mdi-v7.css";
import "@quasar/extras/fontawesome-v5/fontawesome-v5.css";
import "@quasar/extras/fontawesome-v6/fontawesome-v6.css";
import "@quasar/extras/ionicons-v4/ionicons-v4.css";
import "@quasar/extras/eva-icons/eva-icons.css";
import "@quasar/extras/themify/themify.css";
import "@quasar/extras/line-awesome/line-awesome.css";
import "@quasar/extras/bootstrap-icons/bootstrap-icons.css";
// A few examples for animations from Animate.css:
// import @quasar/extras/animate/fadeIn.css
// import @quasar/extras/animate/fadeOut.css
// Import Quasar css
import "quasar/src/css/index.sass";
// quasar css overwrite
import "@/assets/theme-grid.css";
import "@/assets/pos-theme.scss";
import ColorPicker from "@mcistudio/vue-colorpicker";
import "@mcistudio/vue-colorpicker/dist/style.css";

// Assumes your root component is App.vue
// and placed in same folder as main.js
const myApp = createApp(App);
myApp.use(Quasar, {
  plugins: {
    Loading,
    Dialog,
    Notify,
    AppFullscreen,
  },
  //   config: {
  //     loading: /* look at QuasarConfOptions from the API card */
  //   }
});
myApp.use(router);
myApp.use(createPinia());
myApp.use(VueApexCharts);
myApp.use(ColorPicker);

// Initialize lightweight analytics (page views, click events)
initAnalytics({ router });

// Assumes you have a <div id="app"></div> in your index.html
myApp.mount("#app");
