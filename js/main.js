// ================= 게임 시작 =================
const game = new Phaser.Game({
  type: Phaser.AUTO, parent:'game', backgroundColor:'#1d5a73',
  scale:{ mode: Phaser.Scale.RESIZE, width:'100%', height:'100%' },
  scene: [Sea, Board, Duel]
});
$('again').addEventListener('click', () => { $over.hidden = true; seaScene().scene.restart(); });
showGold();
