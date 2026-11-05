Component({
  options: { styleIsolation: "apply-shared" },
  properties: { left: Number },
  data: { game: false, points: 0 },
  methods: {
    play() {
      this.setData({ game: true, points: 0 });
    },
    tap() {
      this.setData({ points: this.data.points + 1 });
    },
    finish() {
      this.triggerEvent("finish");
    },
  },
});
