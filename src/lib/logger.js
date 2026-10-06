function info(message) {
  console.log(message);
}

function error(message, err) {
  if (err) {
    console.error(message);
    console.error(err.stack || err);
    return;
  }
  console.error(message);
}

module.exports = { info, error };
