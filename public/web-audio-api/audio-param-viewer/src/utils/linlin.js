module.exports = (value, inMin, inMax, outMin, outMax) => {
  return (value - inMin) / (inMax - inMin) * (outMax - outMin) + outMin;
};
