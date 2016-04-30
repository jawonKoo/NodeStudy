var fortuneCookies = [
        "Conquer your fears or they will conquer you.",
        "Rivers need springs.",
        "Do not fear what you don't know",
        "You will hane a pleasant surprise.",
        "Whenever possible, keep it simple.",
];

exports.getFortune = function() {
    var idx = Math.floor(Math.random() * fortuneCookies.length);
    return fortuneCookies[idx];
};
