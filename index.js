class RavelYoutube extends Application {
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
    // Charge la vidéo courante et la playlist
    const current = game.settings.get("ravel-fvtt-youtube", "currentVideo") || "";
    const playlist = game.settings.get("ravel-fvtt-youtube", "playlist") || [];
    const isGM = game.user.isGM;
    const embed = this._convertToEmbed(current);
    return { current, embed, playlist, isGM };
  }

  activateListeners(html) {
    super.activateListeners(html);
    if (game.user.isGM) {
      // Quand le MJ change l’URL
      html.find("#yt-url").on("change", ev => {
        const url = ev.target.value;
        this._setCurrentVideo(url);
      });

      // Ajout à la playlist
      html.find("#add-to-playlist").on("click", ev => {
        const url = html.find("#yt-url").val();
        if (url) this._addToPlaylist(url);
      });

      // Lecture depuis la playlist
      html.find(".play-video").on("click", ev => {
        const url = ev.currentTarget.dataset.url;
        this._setCurrentVideo(url);
      });
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

  _convertToEmbed(url) {
    if (!url) return "";
    const videoId = url.split("v=")[1]?.split("&")[0];
    return `https://www.youtube.com/embed/${videoId}?enablejsapi=1`;
  }
}

// Initialisation du module
Hooks.once("init", () => {
  // Enregistre les paramètres persistants
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

  // Réception des sockets
  game.socket.on("module.ravel-fvtt-youtube", data => {
    if (data.action === "setVideo") {
      game.settings.set("ravel-fvtt-youtube", "currentVideo", data.url);
      if (ui.windows["ravel-fvtt-youtube"]) ui.windows["ravel-fvtt-youtube"].render(true);
    }
  });

  // Ajoute un bouton dans la barre Foundry
  Hooks.on("getSceneControlButtons", controls => {
    controls.push({
      name: "ravel-fvtt-youtube",
      title: "Ravel Youtube",
      icon: "fab fa-youtube",
      onClick: () => {
        new YoutubeWidgetAdvanced().render(true);
      }
    });
  });
});
