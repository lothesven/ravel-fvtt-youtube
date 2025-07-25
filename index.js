class RavelYoutube extends Application {
  static player = null;
  static isReady = false;
  static apiLoading = false;
  static socketChannel = "module.ravel-fvtt-youtube";

  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      id: "ravel-fvtt-youtube",
      title: "Ravel Youtube",
      template: "modules/ravel-fvtt-youtube/templates/widget.hbs",
      width: 700,
      height: 500,
      resizable: true
    });
  }

  getData() {
    const current = game.settings.get("ravel-fvtt-youtube", "currentVideo") || "";
    const playlist = game.settings.get("ravel-fvtt-youtube", "playlist") || [];
    const isGM = game.user.isGM;
    return {
      current,
      playlist,
      isGM,
      appId: this.appId // ID unique DOM
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Charger l’API une seule fois
    this._loadYouTubeAPI();

    if (game.user.isGM) {
      // Champ URL
      html.find(`#yt-url-${this.appId}`).on("change", ev => {
        const url = ev.target.value;
        this._setCurrentVideo(url);
      });

      // Ajouter à playlist
      html.find(`#add-to-playlist-${this.appId}`).on("click", () => {
        const url = html.find(`#yt-url-${this.appId}`).val();
        this._addToPlaylist(url);
      });

      // Lecture depuis playlist
      html.find(`.play-video`).on("click", ev => {
        const url = ev.currentTarget.dataset.url;
        this._setCurrentVideo(url);
      });

      // Boutons Play/Pause/Sync
      html.find(`#yt-play-${this.appId}`).on("click", () => this._broadcastState("play"));
      html.find(`#yt-pause-${this.appId}`).on("click", () => this._broadcastState("pause"));
      html.find(`#yt-sync-${this.appId}`).on("click", () => this._broadcastState("sync"));
    }
  }

  _loadYouTubeAPI() {
    if (window.YT && window.YT.Player) return; // déjà chargé
    if (RavelYoutube.apiLoading) return; // déjà en cours

    RavelYoutube.apiLoading = true;
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);

    window.onYouTubeIframeAPIReady = () => {
      RavelYoutube.apiLoading = false;
      console.log("✅ YouTube API loaded");
      this._initPlayer();
    };
  }

  _initPlayer() {
    const containerId = `yt-player-${this.appId}`;
    const container = document.getElementById(containerId);
    if (!container) {
      return ui.notifications.error("YouTube player container not found");
    }

    const url = game.settings.get("ravel-fvtt-youtube", "currentVideo");
    const videoId = this._extractVideoId(url);
    if (!videoId) {
      return ui.notifications.warn("No valid YouTube video loaded yet.");
    }

    RavelYoutube.player = new YT.Player(containerId, {
      videoId: videoId,
      playerVars: { modestbranding: 1 },
      events: {
        onReady: () => {
          RavelYoutube.isReady = true;
          console.log("✅ YouTube Player ready");
        }
      }
    });
  }

  _broadcastState(state) {
    const player = RavelYoutube.player;
    if (!player || !RavelYoutube.isReady) return;

    let time = 0;
    try {
      time = player.getCurrentTime();
    } catch (err) {
      console.warn("⚠ Unable to get current time", err);
    }

    game.socket.emit(RavelYoutube.socketChannel, {
      action: "videoControl",
      state,
      time
    });

    this._applyState(state, time);
  }

  _applyState(state, time) {
    const player = RavelYoutube.player;
    if (!player) return;

    if (state === "play") {
      player.seekTo(time, true);
      player.playVideo();
    } else if (state === "pause") {
      player.pauseVideo();
    } else if (state === "sync") {
      player.seekTo(time, true);
    }
  }

  _setCurrentVideo(url) {
    const videoId = this._extractVideoId(url);
    if (!videoId) return ui.notifications.error("❌ Invalid YouTube URL");

    game.settings.set("ravel-fvtt-youtube", "currentVideo", url);
    game.socket.emit(RavelYoutube.socketChannel, { action: "setVideo", url });
    this.render(true);
  }

  _addToPlaylist(url) {
    const videoId = this._extractVideoId(url);
    if (!videoId) return ui.notifications.error("❌ Invalid YouTube URL");

    let playlist = game.settings.get("ravel-fvtt-youtube", "playlist") || [];
    if (!playlist.includes(url)) playlist.push(url);
    game.settings.set("ravel-fvtt-youtube", "playlist", playlist);
    this.render(true);
  }

  _extractVideoId(url) {
    if (!url) return "";
    // Support watch?v=, youtu.be/, /embed/
    const match = url.match(/(?:v=|youtu\.be\/|\/embed\/)([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : "";
  }
}

Hooks.once("init", () => {
  // Settings persistants
  game.settings.register("ravel-fvtt-youtube", "currentVideo", {
    scope: "world",
    config: false,
    type: String,
    default: ""
  });
  game.settings.register("ravel-fvtt-youtube", "playlist", {
    scope: "world",
    config: false,
    type: Array,
    default: []
  });

  // Socket events
  game.socket.on(RavelYoutube.socketChannel, data => {
    if (data.action === "setVideo") {
      game.settings.set("ravel-fvtt-youtube", "currentVideo", data.url);
      if (ui.windows["ravel-fvtt-youtube"]) ui.windows["ravel-fvtt-youtube"].render(true);
    } else if (data.action === "videoControl") {
      if (ui.windows["ravel-fvtt-youtube"]) {
        ui.windows["ravel-fvtt-youtube"]._applyState(data.state, data.time);
      }
    }
  });

  // Bouton dans la barre de scène
  Hooks.on("getSceneControlButtons", controls => {
    controls.push({
      name: "ravel-fvtt-youtube",
      title: "Ravel Youtube",
      icon: "fab fa-youtube",
      onClick: () => {
        new RavelYoutube().render(true);
      }
    });
  });
});
