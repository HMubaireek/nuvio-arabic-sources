// Known titles (TMDB ids). Each source gets a mix of Arabic and foreign titles it should carry.
const M = (label, id) => ({ label, id, type: "movie" });
const T = (label, id, s, e) => ({ label, id, type: "tv", s, e });

const foreignMovies = [M("Oppenheimer", 872585), M("Dune: Part Two", 693134), M("The Dark Knight", 155)];
const arabicMovies = [M("The Blue Elephant 2 (الفيل الأزرق 2)", 599672), M("Kira & El Gin (كيرة والجن)", 632702), M("Sons of Rizk 3 (ولاد رزق 3)", 629040)];
const foreignTv = [T("Breaking Bad", 1396, 2, 3), T("The Last of Us", 100088, 1, 1)];
const arabicTv = [T("The Assassins (الحشاشين)", 224882, 1, 2), T("Gaafar El Omda (جعفر العمدة)", 218739, 1, 1), T("El Kabeer Awi (الكبير أوي)", 52698, 1, 1)];
const turkishTv = [T("Kurulus Osman (المؤسس عثمان)", 95603, 1, 1), T("Kurulus Osman S5", 95603, 5, 3), T("Resurrection: Ertugrul", 66017, 1, 2)];
const anime = [T("One Piece", 37854, 1, 1), T("Jujutsu Kaisen", 95479, 1, 3), T("Jujutsu Kaisen", 95479, 1, 12), T("Solo Leveling", 127532, 1, 2), M("Your Name", 372058)];

module.exports = {
  default: foreignMovies.slice(0, 2).concat(arabicMovies.slice(0, 1), foreignTv.slice(0, 1), arabicTv.slice(0, 1)),
  topcinema: foreignMovies.concat(foreignTv),
  faselhd: foreignMovies.concat(foreignTv, [T("Jujutsu Kaisen", 95479, 1, 3), M("Your Name", 372058)]),
  akwam: foreignMovies.slice(0, 2).concat(arabicMovies, foreignTv.slice(0, 1), arabicTv),
  arabseed: foreignMovies.slice(0, 2).concat(arabicMovies.slice(0, 1), foreignTv.slice(0, 1), arabicTv.slice(0, 1), turkishTv.slice(0, 1)),
  "3isk": turkishTv,
  laroza: arabicTv.concat(arabicMovies.slice(0, 2), foreignMovies.slice(0, 1)),
  anime4up: anime,
  witanime: anime,
  hub: [M("Oppenheimer", 872585), T("Breaking Bad", 1396, 2, 3), T("Kurulus Osman", 98031, 1, 1), T("One Piece", 37854, 1, 1)],
};
