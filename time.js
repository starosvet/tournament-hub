const TIME_SETTINGS = {
  roundDuration: 60 * 1000 // 1 минута для теста (потом меняешь на 24h)
};

function roundIsOver(startTime) {
  return Date.now() > startTime + TIME_SETTINGS.roundDuration;
}
