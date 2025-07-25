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
    const currentId = game.settings.get("ravel-fvtt-youtube", "currentVideoId") || "";
    const playlist = game.settings.get("ravel-fvtt-youtube", "playlist") || [];
    const isGM = game.user.isGM;

    return {
      currentEmbed: currentId ? `https://www.youtube.com/embed/${currentId}` : "",
      playlist,
      isGM,
      appId: this.appId
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    this._loadYouTubeAPI();

    if (game.user.isGM) {
      // Ajout vidéo
      html.find(`#yt-url-${this.appId}`).on("change", ev => {
        const url = ev.target.value.trim();
        this._setCurrentVideo(url);
      });

      html.find(`#add-to-playlist-${this.appId}`).on("click", () => {
        const url = html.find(`#yt-url-${this.appId}`).val().trim();
        this._addToPlaylist(url);
      });

      // Lecture depuis playlist
      html.find(`.play-video`).on("click", ev => {
        const id = ev.currentTarget.dataset.id;
        this._setCurrentVideoFromId(id);
      });

      // Contrôles synchro
      html.find(`#yt-play-${this.appId}`).on("click", () => this._broadcastState("play"));
      html.find(`#yt-pause-${this.appId}`).on("click", () => this._broadcastState("pause"));
      html.find(`#yt-sync-${this.appId}`).on("click", () => this._broadcastState("sync"));
    }
  }

  /** ✅ Charger l’API YouTube une seule fois */
  _loadYouTubeAPI() {
    if (window.YT && window.YT.Player) return;
    if (RavelYoutube.apiLoading) return;

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

  /** ✅ Initialise le player avec l’ID courant */
  _initPlayer() {
    const containerId = `yt-player-${this.appId}`;
    const container = document.getElementById(containerId);
    if (!container) return ui.notifications.error("YouTube player container not found");

    const videoId = game.settings.get("ravel-fvtt-youtube", "currentVideoId");
    if (!videoId) return;

    RavelYoutube.player = new YT.Player(containerId, {
      videoId,
      playerVars: { modestbranding: 1 },
      events: {
        onReady: () => {
          RavelYoutube.isReady = true;
          console.log("✅ YouTube Player ready");
        }
      }
    });
  }

  /** ✅ Envoie lecture/pause/seek à tous les joueurs */
  _broadcastState(state) {
    const player = RavelYoutube.player;
    if (!player || !RavelYoutube.isReady) return;

    let time = 0;
    try {
      time = player.getCurrentTime();
    } catch (err) {
      console.warn("⚠ Unable to get current time", err);
    }

    game.socket.emit(RavelYoutube.socketChannel, { action: "videoControl", state, time });
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

  /** ✅ Définit une vidéo comme courante (depuis URL) */
  _setCurrentVideo(url) {
    const videoId = this._extractVideoId(url);
    if (!videoId) return ui.notifications.error("❌ Invalid or non-YouTube URL");

    game.settings.set("ravel-fvtt-youtube", "currentVideoId", videoId);
    game.socket.emit(RavelYoutube.socketChannel, { action: "setVideo", id: videoId });
    this.render(true);
  }

  /** ✅ Définit une vidéo courante directement par ID */
  _setCurrentVideoFromId(videoId) {
    if (!this._validateVideoId(videoId)) return ui.notifications.error("❌ Invalid YouTube ID");

    game.settings.set("ravel-fvtt-youtube", "currentVideoId", videoId);
    game.socket.emit(RavelYoutube.socketChannel, { action: "setVideo", id: videoId });
    this.render(true);
  }

  /** ✅ Ajoute une vidéo à la playlist (stockage ID uniquement) avec un label en input*/
  _addToPlaylist(url) {
    const videoId = this._extractVideoId(url);
    if (!videoId) return ui.notifications.error("❌ Invalid or non-YouTube URL");
  
    // Demander un titre au GM (dialogue simple)
    new Dialog({
      title: "Add Video to Playlist",
      content: `
        <div>
          <label>Optional title:</label>
          <input type="text" id="yt-title" placeholder="My cool video title" style="width:100%"/>
        </div>
      `,
      buttons: {
        ok: {
          label: "Add",
          callback: html => {
            const title = html.find("#yt-title").val().trim() || `https://youtu.be/${videoId}`;
  
            let playlist = game.settings.get("ravel-fvtt-youtube", "playlist") || [];
            if (!playlist.find(v => v.id === videoId)) {
              playlist.push({ id: videoId, label: title });
              game.settings.set("ravel-fvtt-youtube", "playlist", playlist);
              this.render(true);
              ui.notifications.info(`✅ Added "${title}" to playlist`);
            } else {
              ui.notifications.info("✅ Video already in playlist");
            }
          }
        },
        cancel: {
          label: "Cancel"
        }
      }
    }).render(true);
  }


  /** ✅ Extraction d’un ID valide */
  _extractVideoId(url) {
    if (!url) return "";
    try {
      const parsed = new URL(url);
      const domain = parsed.hostname.replace("www.", "");
      if (!["youtube.com", "youtu.be"].includes(domain)) return "";

      // support watch?v=xxx
      if (parsed.searchParams.has("v")) {
        const id = parsed.searchParams.get("v");
        return this._validateVideoId(id) ? id : "";
      }

      // support youtu.be/xxx ou embed/xxx
      const match = url.match(/(?:youtu\.be\/|\/embed\/)([a-zA-Z0-9_-]{11})/);
      if (match) return match[1];

      return "";
    } catch (e) {
      return "";
    }
  }

  /** ✅ Validation stricte d’un ID YouTube */
  _validateVideoId(id) {
    return typeof id === "string" && /^[a-zA-Z0-9_-]{11}$/.test(id);
  }
}

// Initialisation du module
Hooks.once("init", () => {
  game.settings.register("ravel-fvtt-youtube", "currentVideoId", {
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
      game.settings.set("ravel-fvtt-youtube", "currentVideoId", data.id);
      if (ui.windows["ravel-fvtt-youtube"]) ui.windows["ravel-fvtt-youtube"].render(true);
    } else if (data.action === "videoControl") {
      if (ui.windows["ravel-fvtt-youtube"]) {
        ui.windows["ravel-fvtt-youtube"]._applyState(data.state, data.time);
      }
    }
  });

  Hooks.on("getSceneControlButtons", controls => {
    controls.push({
      name: "ravel-fvtt-youtube",
      title: "Ravel Youtube",
      icon: "fab fa-youtube",
      onClick: () => new RavelYoutube().render(true)
    });
  });
});
