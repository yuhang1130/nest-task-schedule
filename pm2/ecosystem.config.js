const projectDir = "./";
module.exports = {
  apps: [
    {
      name: "Web",
      script: projectDir + "dist/main.js",
      args: "",
      instances: +(process.env.INSTANCES ?? 2),
      exec_mode: "cluster",
      autorestart: true,
      restart_delay: 3e3,
      watch: false,
      kill_timeout: 10e3,
      max_memory_restart: "4G",
    },
  ],
};
