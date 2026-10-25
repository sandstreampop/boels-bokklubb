// The prompt pools. Plain string arrays: adding one is a line and ships over the air. Swedish,
// short, concrete, about the book she just read. Write prompts may contain `___`, a blank she
// fills in; the card renders the prompt with her words in the blank. Nothing is spoken: prompts are
// text only (product rule).
//
// Picking is uniformly random but never the same prompt twice in a row per pool; the last index per
// pool lives in the store so it survives a relaunch.

import { getState, rememberPrompt } from './store';
import { debug } from './telemetry';
import type { PromptPool } from './types';

export const prompts: Record<PromptPool, readonly string[]> = {
  speak: [
    'Vad hände i boken?',
    'Vem tyckte du mest om?',
    'Var det något som var läskigt?',
    'Vad var det roligaste?',
    'Hur slutade boken?',
    'Vad skulle du ha gjort om du var med i boken?',
    'Vilket djur eller person var dummast?',
    'Var det något du inte förstod?',
    'Vad luktade det i boken, tror du?',
    'Vilken bild var finast?',
    'Var det en bra bok? Varför?',
    'Vad hette den du gillade mest, och varför gillade du den?',
    'Fanns det något gott att äta i boken?',
    'Vad tror du händer efter slutet?',
    'Var det någon som var ledsen? Varför?',
    'Var det någon som var modig?',
    'Vad var det konstigaste i boken?',
    'Vilket ställe i boken skulle du vilja besöka?',
    'Om du fick byta namn på boken, vad skulle den heta?',
    'Vad tror du mamma eller pappa tycker om den här boken?',
    'Berätta om början.',
    'Berätta om mitten.',
    'Berätta om slutet.',
    'Fanns det något som var orättvist?',
    'Vem skulle du vilja vara kompis med i boken?',
    'Vad lärde du dig?',
    'Skrattade du någon gång? När?',
    'Var det någon som bråkade? Om vad?',
    'Vilka färger var det mest av i boken?',
    'Om boken var en dröm, vad skulle du drömma?',
    'Vad gjorde den som var elak?',
    'Vem skulle du ge en kram i boken?',
    'Fanns det en hemlighet i boken?',
    'Vad var det tråkigaste?',
    'Om du fick ändra en sak i boken, vad då?',
    'Vilken sida vill du läsa igen?',
    'Var det någon som fick hjälp? Av vem?',
    'Vad skulle du säga till den som skrev boken?',
    'Vilket ljud hördes mest i boken?',
    'Var hände boken? Hemma, i skogen, någon annanstans?',
    'Vem i boken är mest som du?',
    'Vad tyckte du om bilderna?',
    'Vilken sak i boken skulle du vilja ha?',
    'Var det någon som ljög?',
    'Hur kändes det i magen när du läste?',
    'Vad skulle du berätta för din bästa kompis om boken?',
    'Vem skulle du inte vilja träffa i boken?',
    'Var det någon som sprang, flög eller simmade? Berätta.',
    'Vad var det bästa någon sa i boken?',
    'Ge boken stjärnor och berätta varför.',
  ],
  write: [
    'Boken handlade om ___',
    'Den jag gillade mest var ___',
    'Det roligaste var när ___',
    'Jag blev rädd när ___',
    'Slutet var ___',
    'Om jag var med i boken skulle jag ___',
    'Jag tyckte boken var ___',
    'Den dummaste i boken var ___',
    'Det finaste i boken var ___',
    'Jag ville att ___',
    'Det konstigaste var ___',
    'Jag skrattade när ___',
    'Jag blev ledsen när ___',
    'Den modigaste var ___',
    'Boken borde heta ___',
    'Jag skulle vilja bo i ___',
    'Det godaste i boken var ___',
    'Jag förstod inte ___',
    'Efter slutet tror jag att ___',
    'Jag skulle vilja vara kompis med ___',
    'Det var orättvist att ___',
    'Jag lärde mig att ___',
    'Den elaka gjorde ___',
    'Jag skulle ge en kram till ___',
    'Hemligheten i boken var ___',
    'Det tråkigaste var ___',
    'Jag skulle ändra ___',
    'Sidan jag vill läsa igen är ___',
    'Jag skulle säga till den som skrev boken att ___',
    'Boken hände i ___',
    'Den som är mest som jag är ___',
    'Bilderna var ___',
    'Jag skulle vilja ha ___ från boken',
    'I magen kändes det ___',
    'Till min kompis skulle jag säga att ___',
    'Det bästa någon sa var ___',
    'Boken får ___ stjärnor för att ___',
    'Skriv tre ord om boken.',
    'Skriv vad du tänker på just nu.',
    'Skriv ett brev till någon i boken.',
    'Skriv vad som hände först, sen och sist.',
    'Skriv något som var roligt.',
    'Skriv något som var läskigt.',
    'Skriv vad du skulle göra om du var huvudpersonen.',
    'Skriv en fråga till någon i boken.',
    'Skriv vad du gillade bäst.',
    'Skriv om bilden du gillade mest.',
    'Skriv ett nytt slut.',
    'Skriv vad du vill läsa om nästa gång.',
    'Skriv varför någon annan borde läsa boken.',
  ],
  draw: [
    'Rita den du gillade mest i boken.',
    'Rita det läskigaste.',
    'Rita det roligaste som hände.',
    'Rita slutet.',
    'Rita var boken hände.',
    'Rita dig själv i boken.',
    'Rita ett nytt omslag.',
    'Rita det godaste i boken.',
    'Rita den dummaste.',
    'Rita en sak från boken som du vill ha.',
    'Rita vad som händer efter slutet.',
    'Rita den modigaste.',
    'Rita ett djur från boken.',
    'Rita ett hus från boken.',
    'Rita det finaste stället.',
    'Rita vad huvudpersonen drömmer om.',
    'Rita något som var konstigt.',
    'Rita en ny kompis till huvudpersonen.',
    'Rita boken som en karta.',
    'Rita det bästa ljudet i boken.',
    'Rita hur det kändes i magen.',
    'Rita det första som hände.',
    'Rita det som hände i mitten.',
    'Rita vad du skulle ge till den som var ledsen.',
    'Rita en present till den du gillade mest.',
    'Rita det som var orättvist.',
    'Rita hemligheten.',
    'Rita ett monster från boken, eller hitta på ett.',
    'Rita ett fordon som passar i boken.',
    'Rita vädret i boken.',
    'Rita den elaka, snäll.',
    'Rita vad som finns bakom dörren i boken.',
    'Rita något som flyger i boken.',
    'Rita något som växer i boken.',
    'Rita en fest för alla i boken.',
    'Rita boken i bara en färg.',
    'Rita det du vill läsa om nästa gång.',
    'Rita en bild till sidan du gillade mest.',
    'Rita huvudpersonen som gammal.',
    'Rita huvudpersonen som bebis.',
    'Rita boken som en tårta.',
    'Rita något du skulle bygga i boken.',
    'Rita en maskin som hjälper någon i boken.',
    'Rita mamma eller pappa i boken.',
    'Rita den du skulle vilja krama.',
    'Rita det tråkigaste, men roligt.',
    'Rita en skylt som hör hemma i boken.',
    'Rita vad som är i fickan på huvudpersonen.',
    'Rita boken som ett djur.',
    'Rita stjärnorna du ger boken.',
  ],
};

export const BLANK = '___';

export const isFillIn = (prompt: string | null | undefined): prompt is string => !!prompt && prompt.includes(BLANK);

/** A write prompt split around its blank, for rendering her text inside it. */
export function splitFillIn(prompt: string): { before: string; after: string } {
  const i = prompt.indexOf(BLANK);
  if (i < 0) return { before: prompt, after: '' };
  return { before: prompt.slice(0, i), after: prompt.slice(i + BLANK.length) };
}

/** Random prompt from a pool, never the one shown last time. */
export function pickPrompt(pool: PromptPool): string {
  const list = prompts[pool];
  const last = getState().lastPrompt[pool];
  let index = Math.floor(Math.random() * list.length);
  if (list.length > 1 && index === last) index = (index + 1 + Math.floor(Math.random() * (list.length - 1))) % list.length;
  rememberPrompt(pool, index);
  debug('prompt.pick', { pool, index });
  return list[index];
}
