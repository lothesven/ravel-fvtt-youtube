class RavelYoutube extends Application {
  static player = null;
  static isReady = false;

  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      id: "ravel-fvtt-youtube",
      title: "Ravel YouTube",
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
    return { current, playlist, isGM };
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Charger API YouTube si non présent
    if (!window.YT) this._loadYouTubeAPI();

    if (game.user.isGM) {
      html.find("#yt-url").on("change", ev => {
        const url = ev.target.value;
        this._setCurrentVideo(url);
      });
      html.find("#add-to-playlist").on("click", ev => {
        const url = html.find("#yt-url").val();
        if (url) this._addToPlaylist(url);
      });
      html.find(".play-video").on("click", ev => {
        const url = ev.currentTarget.dataset.url;
        this._setCurrentVideo(url);
      });

      // Boutons synchro
      html.find("#yt-play").on("click", () => this._broadcastState("play"));
      html.find("#yt-pause").on("click", () => this._broadcastState("pause"));
      html.find("#yt-sync").on("click", () => this._broadcastState("sync"));
    }
  }

  _loadYouTubeAPI() {
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);

    window.onYouTubeIframeAPIReady = () => {
      console.log("YouTube API loaded");
      this._initPlayer();
    };
  }

  _initPlayer() {
    const container = document.getElementById("yt-player");
    if (!container) return;

    const url = game.settings.get("ravel-fvtt-youtube", "currentVideo");
    const videoId = this._extractVideoId(url);

    YoutubeWidgetAdvanced.player = new YT.Player("yt-player", {
      videoId: videoId,
      playerVars: { modestbranding: 1 },
      events: {
        onReady: () => {
          YoutubeWidgetAdvanced.isReady = true;
        }
      }
    });
  }

  _broadcastState(state) {
    if (!YoutubeWidgetAdvanced.player) return;

    const time = YoutubeWidgetAdvanced.player.getCurrentTime();
    game.socket.emit("module.ravel-fvtt-youtube", {
      action: "videoControl",
      state,
      time
    });

    // Applique localement
    this._applyState(state, time);
  }

  _applyState(state, time) {
    const player = YoutubeWidgetAdvanced.player;
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
    game.settings.set("ravel-fvtt-youtube", "currentVideo", url);
    game.socket.emit("module.ravel-fvtt-youtube", { action: "setVideo", url });
    this.render(true);
  }

  _addToPlaylist(url) {
    let playlist = game.settings.get("ravel-fvtt-youtube", "playlist") || [];
    if (!playlist.includes(url)) playlist.push(url);
    game.settings.set("ravel-fvtt-youtube", "playlist", playlist);
    this.render(true);
  }

  _extractVideoId(url) {
    if (!url) return "";
    const match = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    return match ? match[1] : "";
  }
}

Hooks.once("init", () => {
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

  game.socket.on("module.youtube-widget-advanced", data => {
    if (data.action === "setVideo") {
      game.settings.set("ravel-fvtt-youtube", "currentVideo", data.url);
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
      title: "Ravel YouTube",
      icon: "fab fa-youtube",
      onClick: () => {
        new YoutubeWidgetAdvanced().render(true);
      }
    });
  });
});

