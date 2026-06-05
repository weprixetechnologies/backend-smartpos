const safeEmployee = (emp) => {
  if (!emp) return emp;
  const { password_hash, ...safe } = emp;
  return safe;
};

module.exports = safeEmployee;
