// The `en-a1` demo pack: English A1 for Spanish speakers, 6 lessons of 5 cards.
// A module, not a JSON file, because the mod runs without Node or fs and cannot
// import JSON (and tests cannot read files either, so the old JSON was removed).
export const DEMO_PACK_ID = "demo-english-a1";
export const DEMO_PACK_TITLE = "English A1 demo (for Spanish speakers)";
export const DEMO_LESSON_COUNT = 6;
export const DEMO_CARDS = [
    { id: "en-a1-01-01", lesson: 1, prompt: "Hola", answer: "Hello", tags: ["en-a1", "greetings", "leccion-01"] },
    { id: "en-a1-01-02", lesson: 1, prompt: "Buenos días", answer: "Good morning", tags: ["en-a1", "greetings", "leccion-01"] },
    { id: "en-a1-01-03", lesson: 1, prompt: "Buenas noches", answer: "Good night", tags: ["en-a1", "greetings", "leccion-01"] },
    { id: "en-a1-01-04", lesson: 1, prompt: "Adiós", answer: "Goodbye", tags: ["en-a1", "greetings", "leccion-01"] },
    { id: "en-a1-01-05", lesson: 1, prompt: "¿Cómo estás?", answer: "How are you?", tags: ["en-a1", "greetings", "leccion-01"] },
    { id: "en-a1-02-01", lesson: 2, prompt: "Me llamo Ana", answer: "My name is Ana", tags: ["en-a1", "introductions", "leccion-02"] },
    { id: "en-a1-02-02", lesson: 2, prompt: "¿Cómo te llamas?", answer: "What's your name?", tags: ["en-a1", "introductions", "leccion-02"] },
    { id: "en-a1-02-03", lesson: 2, prompt: "Mucho gusto", answer: "Nice to meet you", tags: ["en-a1", "introductions", "leccion-02"] },
    { id: "en-a1-02-04", lesson: 2, prompt: "Soy de Venezuela", answer: "I'm from Venezuela", tags: ["en-a1", "introductions", "leccion-02"] },
    { id: "en-a1-02-05", lesson: 2, prompt: "¿De dónde eres?", answer: "Where are you from?", tags: ["en-a1", "introductions", "leccion-02"] },
    { id: "en-a1-03-01", lesson: 3, prompt: "uno", answer: "one", tags: ["en-a1", "numbers", "leccion-03"] },
    { id: "en-a1-03-02", lesson: 3, prompt: "dos", answer: "two", tags: ["en-a1", "numbers", "leccion-03"] },
    { id: "en-a1-03-03", lesson: 3, prompt: "tres", answer: "three", tags: ["en-a1", "numbers", "leccion-03"] },
    { id: "en-a1-03-04", lesson: 3, prompt: "cuatro", answer: "four", tags: ["en-a1", "numbers", "leccion-03"] },
    { id: "en-a1-03-05", lesson: 3, prompt: "cinco", answer: "five", tags: ["en-a1", "numbers", "leccion-03"] },
    { id: "en-a1-04-01", lesson: 4, prompt: "madre", answer: "mother", tags: ["en-a1", "family", "leccion-04"] },
    { id: "en-a1-04-02", lesson: 4, prompt: "padre", answer: "father", tags: ["en-a1", "family", "leccion-04"] },
    { id: "en-a1-04-03", lesson: 4, prompt: "hermano", answer: "brother", tags: ["en-a1", "family", "leccion-04"] },
    { id: "en-a1-04-04", lesson: 4, prompt: "hermana", answer: "sister", tags: ["en-a1", "family", "leccion-04"] },
    { id: "en-a1-04-05", lesson: 4, prompt: "amigo", answer: "friend", tags: ["en-a1", "family", "leccion-04"] },
    { id: "en-a1-05-01", lesson: 5, prompt: "agua", answer: "water", tags: ["en-a1", "food", "leccion-05"] },
    { id: "en-a1-05-02", lesson: 5, prompt: "pan", answer: "bread", tags: ["en-a1", "food", "leccion-05"] },
    { id: "en-a1-05-03", lesson: 5, prompt: "manzana", answer: "apple", tags: ["en-a1", "food", "leccion-05"] },
    { id: "en-a1-05-04", lesson: 5, prompt: "café", answer: "coffee", tags: ["en-a1", "food", "leccion-05"] },
    { id: "en-a1-05-05", lesson: 5, prompt: "Tengo hambre", answer: "I'm hungry", tags: ["en-a1", "food", "leccion-05"] },
    { id: "en-a1-06-01", lesson: 6, prompt: "Por favor", answer: "Please", tags: ["en-a1", "polite-phrases", "leccion-06"] },
    { id: "en-a1-06-02", lesson: 6, prompt: "Gracias", answer: "Thank you", tags: ["en-a1", "polite-phrases", "leccion-06"] },
    { id: "en-a1-06-03", lesson: 6, prompt: "De nada", answer: "You're welcome", tags: ["en-a1", "polite-phrases", "leccion-06"] },
    { id: "en-a1-06-04", lesson: 6, prompt: "Lo siento", answer: "I'm sorry", tags: ["en-a1", "polite-phrases", "leccion-06"] },
    { id: "en-a1-06-05", lesson: 6, prompt: "No entiendo", answer: "I don't understand", tags: ["en-a1", "polite-phrases", "leccion-06"] },
];
