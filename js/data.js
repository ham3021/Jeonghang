// Combines SILMOO_BOOK (silmoo_data.js) and MIN_BOOK (min_data.js)
const DB = {
  books: [SILMOO_BOOK, MIN_BOOK]
};

function getAllThemes() {
  const themes = [];
  DB.books.forEach(book => {
    book.subjects.forEach(subject => {
      subject.themes.forEach(theme => {
        themes.push({ ...theme, subjectId: subject.id, subjectName: subject.name, bookId: book.id, bookName: book.name });
      });
    });
  });
  return themes;
}

function getThemeById(id) {
  return getAllThemes().find(t => t.id === id);
}

function getSubjectById(id) {
  for (const book of DB.books) {
    const subject = book.subjects.find(s => s.id === id);
    if (subject) return { ...subject, bookId: book.id, bookName: book.name };
  }
  return null;
}
