const safeMerchant = (merchant) => {
    if (!merchant) return null;
    const { password_hash, ...safe } = merchant;
    return safe;
};

module.exports = safeMerchant;
