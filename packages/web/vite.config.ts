import react from "@vitejs/plugin-react";
import type { UserConfig } from "vite";

const config: UserConfig = {
  plugins: [react()],
  build: {
    // Independum serves its UI from the computer it runs on, so one large file costs no network
    // time, and splitting it would risk the order in which its libraries start.
    chunkSizeWarningLimit: 1200,
  },
};

export default config;
