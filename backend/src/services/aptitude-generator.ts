import { randomInt } from "node:crypto";

/**
 * Builds fresh aptitude questions on demand, with new numbers every time, so a student never sees the same
 * question twice. The answer is computed from the same numbers that go into the question, so it is always right.
 */
export type GenCategory = "quant" | "logical" | "verbal";
export type GenDifficulty = "easy" | "medium" | "hard";
export type GeneratedQuestion = { category: GenCategory; topic: string; difficulty: GenDifficulty; prompt: string; options: string[]; correctOptionIndex: number; explanation: string; tags: string[] };

type Draft = { topic: string; prompt: string; correct: string; wrong: string[]; explanation: string };
type Template = { category: GenCategory; topic: string; difficulties: GenDifficulty[]; build: (difficulty: GenDifficulty) => Draft | null };

const ri = (min: number, max: number) => randomInt(min, max + 1);
const pick = <T,>(items: readonly T[]) => items[randomInt(0, items.length)];
const shuffle = <T,>(items: T[]) => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) { const j = randomInt(0, i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
};
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));
const fraction = (n: number, d: number) => { const g = gcd(n, d) || 1; return d / g === 1 ? `${n / g}` : `${n / g}/${d / g}`; };
const inr = (n: number) => `₹${Number.isInteger(n) ? n.toLocaleString("en-IN") : n.toFixed(2)}`;
const unit = (n: number, word: string) => `${num(n)} ${n === 1 ? word : `${word}s`}`;
const num = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

/** Distinct wrong numbers close to the right one, so the options look plausible. */
function near(correct: number, step: number, extra: number[] = []) {
  const found = new Set<number>(extra.filter(value => value !== correct && value > 0));
  const offsets = shuffle([1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6]);
  for (const offset of offsets) { if (found.size >= 3) break; const candidate = correct + offset * step; if (candidate > 0 && candidate !== correct) found.add(candidate); }
  return shuffle([...found]).slice(0, 3);
}

const NAMES = ["Aarav", "Diya", "Kabir", "Meera", "Rohan", "Sana", "Vikram", "Anika", "Ishaan", "Nisha", "Arjun", "Tara", "Farhan", "Pooja", "Dev", "Leela"];
const ITEMS = ["a laptop bag", "a pair of shoes", "a backpack", "a smartwatch", "a study lamp", "a jacket", "a printer", "headphones", "a water bottle set"];

const quant: Template[] = [
  { category: "quant", topic: "percentages", difficulties: ["easy", "medium"], build: difficulty => {
    const price = ri(4, 60) * 50; const d = pick([5, 10, 15, 20, 25, 30, 40]);
    if (difficulty === "easy") {
      const item = pick(ITEMS); const sp = price * (100 - d) / 100;
      return { topic: "percentages", prompt: `${item[0].toUpperCase() + item.slice(1)} is marked at ${inr(price)} and sold at a ${d}% discount. What is the selling price?`, correct: inr(sp), wrong: near(sp, price / 20).map(inr), explanation: `Selling price = ${price} × (100 − ${d})/100 = ${inr(sp)}.` };
    }
    const d1 = pick([10, 20, 25, 50]); const d2 = pick([10, 20, 25, 50]); const base = ri(1, 12) * 400;
    const final = base * (100 - d1) * (100 - d2) / 10000;
    return { topic: "percentages", prompt: `A shop gives two successive discounts of ${d1}% and ${d2}% on an item marked at ${inr(base)}. What does the customer pay?`, correct: inr(final), wrong: [inr(base * (100 - d1 - d2) / 100), inr(base * (100 - d1) / 100), inr(final + base / 20)], explanation: `Pay ${base} × ${(100 - d1) / 100} × ${(100 - d2) / 100} = ${inr(final)}. Successive discounts multiply; they do not add.` };
  } },
  { category: "quant", topic: "averages", difficulties: ["easy", "medium", "hard"], build: difficulty => {
    if (difficulty === "easy") {
      const n = ri(4, 8); const avg = ri(12, 60); const last = ri(5, avg + 20); const known = n * avg - last;
      return { topic: "averages", prompt: `The average of ${n} numbers is ${avg}. If ${n - 1} of them add up to ${known}, what is the remaining number?`, correct: String(last), wrong: near(last, 2, [avg]).map(String), explanation: `Total = ${n} × ${avg} = ${n * avg}. Remaining = ${n * avg} − ${known} = ${last}.` };
    }
    const n = ri(5, 12); const avg = ri(20, 32); const delta = ri(1, 2); const newAvg = avg + delta; const joiner = newAvg * (n + 1) - n * avg;
    return { topic: "averages", prompt: `The average age of ${n} players in a team is ${avg} years. When a new player joins, the average rises to ${newAvg} years. How old is the new player?`, correct: `${joiner} years`, wrong: near(joiner, 2, [newAvg]).map(value => `${value} years`), explanation: `New total = ${n + 1} × ${newAvg} = ${newAvg * (n + 1)}. Old total = ${n} × ${avg} = ${n * avg}. The new player is ${joiner} years old.` };
  } },
  { category: "quant", topic: "ratios", difficulties: ["easy", "medium", "hard"], build: difficulty => {
    const a = ri(2, 9); const b = ri(2, 9);
    if (a === b) return null;
    if (difficulty === "easy") {
      const k = ri(3, 30); const total = (a + b) * k; const [x, y] = [a, b].sort((p, q) => q - p);
      return { topic: "ratios", prompt: `${inr(total * 10)} is shared between ${pick(NAMES)} and ${pick(NAMES)} in the ratio ${a}:${b}. What is the larger share?`, correct: inr(x * k * 10), wrong: near(x * k * 10, 10 * k, [y * k * 10]).map(inr), explanation: `One part = ${total * 10}/${a + b} = ${k * 10}. Larger share = ${x} × ${k * 10} = ${inr(x * k * 10)}.` };
    }
    const k = ri(2, 12); const girlsAdded = ri(2, 6) * a;
    const boys = a * k; const girls = b * k;
    const nb = boys; const ng = girls + girlsAdded; const g2 = gcd(nb, ng);
    return { topic: "ratios", prompt: `A class has boys and girls in the ratio ${a}:${b}. After ${girlsAdded} more girls join, the ratio becomes ${nb / g2}:${ng / g2}. How many boys are in the class?`, correct: String(boys), wrong: near(boys, a, [girls]).map(String), explanation: `Boys stay at ${a}x and girls grow from ${b}x by ${girlsAdded}. Solving ${a}x : (${b}x + ${girlsAdded}) = ${nb / g2}:${ng / g2} gives x = ${k}, so boys = ${boys}.` };
  } },
  { category: "quant", topic: "time-speed-distance", difficulties: ["easy", "medium", "hard"], build: difficulty => {
    if (difficulty === "easy") {
      const speed = ri(4, 18) * 5; const hours = ri(2, 9); const dist = speed * hours; const other = ri(2, 6) * speed + speed;
      return { topic: "time-speed-distance", prompt: `A bus covers ${dist} km in ${hours} hours. At the same speed, how long will it take to cover ${other} km?`, correct: unit(other / speed, "hour"), wrong: near(other / speed, 0.5).map(value => unit(value, "hour")), explanation: `Speed = ${dist}/${hours} = ${speed} km/h. Time = ${other}/${speed} = ${num(other / speed)} hours.` };
    }
    if (difficulty === "medium") {
      const s1 = ri(4, 12) * 5; const s2 = ri(4, 12) * 5; const k = ri(2, 6); const dist = (s1 + s2) * k;
      return { topic: "time-speed-distance", prompt: `Two cars start at the same time from towns ${dist} km apart and drive towards each other at ${s1} km/h and ${s2} km/h. After how many hours do they meet?`, correct: unit(k, "hour"), wrong: near(k, 1, [Math.round(dist / Math.max(s1, s2))]).map(value => unit(value, "hour")), explanation: `They close ${s1 + s2} km every hour, so they meet after ${dist}/${s1 + s2} = ${k} hours.` };
    }
    const pair = pick([[40, 60, 48], [30, 60, 40], [60, 90, 72], [20, 30, 24], [30, 45, 36], [50, 75, 60], [40, 80, 160 / 3]] as const).slice(0, 3);
    if (!Number.isInteger(pair[2])) return null;
    return { topic: "time-speed-distance", prompt: `A cyclist rides from A to B at ${pair[0]} km/h and returns along the same road at ${pair[1]} km/h. What is the average speed for the whole trip?`, correct: `${pair[2]} km/h`, wrong: [`${(pair[0] + pair[1]) / 2} km/h`, `${pair[2] + 4} km/h`, `${pair[2] - 4} km/h`], explanation: `For equal distances, average speed = 2ab/(a+b) = 2 × ${pair[0]} × ${pair[1]} / ${pair[0] + pair[1]} = ${pair[2]} km/h, not the simple mean.` };
  } },
  { category: "quant", topic: "profit-loss", difficulties: ["easy", "medium", "hard"], build: difficulty => {
    const cp = ri(4, 80) * 25; const p = pick([10, 20, 25, 30, 40, 50]);
    if (difficulty === "easy") {
      const sp = cp * (100 + p) / 100;
      return { topic: "profit-loss", prompt: `A trader buys ${pick(ITEMS)} for ${inr(cp)} and sells it at a profit of ${p}%. What is the selling price?`, correct: inr(sp), wrong: near(sp, cp / 20).map(inr), explanation: `Selling price = ${cp} × (100 + ${p})/100 = ${inr(sp)}.` };
    }
    if (difficulty === "medium") {
      const loss = pick([10, 20, 25]); const base = ri(2, 30) * 100; const sp = base * (100 - loss) / 100;
      return { topic: "profit-loss", prompt: `Selling ${pick(ITEMS)} for ${inr(sp)} results in a loss of ${loss}%. What was the cost price?`, correct: inr(base), wrong: [inr(sp * (100 + loss) / 100), inr(base + 100), inr(Math.max(50, base - 100))], explanation: `Cost price = ${sp} × 100/(100 − ${loss}) = ${inr(base)}.` };
    }
    const mp = ri(2, 20) * 200; const d = pick([10, 20, 25]); const profit = pick([5, 10, 12.5, 20]);
    const sp = mp * (100 - d) / 100; const costPrice = sp * 100 / (100 + profit);
    if (!Number.isInteger(costPrice)) return null;
    return { topic: "profit-loss", prompt: `An item marked at ${inr(mp)} is sold after a ${d}% discount and still earns a profit of ${profit}%. What was its cost price?`, correct: inr(costPrice), wrong: [inr(sp), inr(mp * (100 - d - profit) / 100), inr(costPrice + 100)], explanation: `Selling price = ${mp} × ${(100 - d) / 100} = ${sp}. Cost price = ${sp} × 100/${100 + profit} = ${inr(costPrice)}.` };
  } },
  { category: "quant", topic: "simple-interest", difficulties: ["easy", "medium"], build: difficulty => {
    const principal = ri(2, 40) * 500; const rate = ri(2, 15); const years = ri(2, 8); const si = principal * rate * years / 100;
    if (difficulty === "easy") return { topic: "simple-interest", prompt: `What is the simple interest on ${inr(principal)} at ${rate}% per year for ${years} years?`, correct: inr(si), wrong: near(si, principal / 100).map(inr), explanation: `SI = P × R × T / 100 = ${principal} × ${rate} × ${years} / 100 = ${inr(si)}.` };
    return { topic: "simple-interest", prompt: `A sum of ${inr(principal)} earns ${inr(si)} as simple interest in ${years} years. What is the annual rate of interest?`, correct: `${rate}%`, wrong: near(rate, 1).map(value => `${value}%`), explanation: `Rate = SI × 100 / (P × T) = ${si} × 100 / (${principal} × ${years}) = ${rate}%.` };
  } },
  { category: "quant", topic: "time-work", difficulties: ["easy", "medium", "hard"], build: difficulty => {
    const pairs: Array<[number, number, number]> = [[12, 24, 8], [10, 15, 6], [20, 30, 12], [15, 30, 10], [18, 9, 6], [40, 60, 24], [30, 45, 18], [12, 6, 4], [8, 8, 4], [36, 18, 12]];
    const [a, b, together] = pick(pairs);
    if (difficulty === "easy") return { topic: "time-work", prompt: `${pick(NAMES)} can finish a job in ${a} days and ${pick(NAMES)} in ${b} days. Working together, how many days will they take?`, correct: unit(together, "day"), wrong: near(together, 1, [Math.round((a + b) / 2)]).map(value => unit(value, "day")), explanation: `Together they do 1/${a} + 1/${b} = 1/${together} of the job a day, so ${together} days.` };
    if (difficulty === "medium") {
      const done = Math.max(1, Math.floor(together / 2)); const left = 1 - done / a; const days = left * b;
      if (!Number.isInteger(days * 2)) return null;
      return { topic: "time-work", prompt: `A can do a job in ${a} days and B in ${b} days. A works alone for ${done} days and then B finishes the rest. How many more days does B need?`, correct: unit(days, "day"), wrong: near(days, 1, [together]).map(value => unit(value, "day")), explanation: `A finishes ${done}/${a} of the job, leaving ${num(left)}. B needs ${num(left)} × ${b} = ${num(days)} days.` };
    }
    const t = ri(2, 8) * 3; const slow = 2 * t; const both = slow / 3;
    return { topic: "time-work", prompt: `A is twice as fast as B. A alone can finish a job in ${t} days. In how many days can A and B finish it working together?`, correct: unit(both, "day"), wrong: near(both, 1, [t / 2, (t + slow) / 2]).map(value => unit(value, "day")), explanation: `B takes ${slow} days. Together: 1/${t} + 1/${slow} = 3/${slow}, so ${slow}/3 = ${num(both)} days.` };
  } },
  { category: "quant", topic: "ages", difficulties: ["medium", "hard"], build: () => {
    const a = ri(2, 6); const b = ri(2, 6); if (a === b) return null;
    const x = ri(3, 9); const yearsLater = ri(3, 10);
    const ageA = a * x; const ageB = b * x; const nA = ageA + yearsLater; const nB = ageB + yearsLater; const g = gcd(nA, nB);
    return { topic: "ages", prompt: `The present ages of two friends are in the ratio ${a}:${b}. After ${yearsLater} years the ratio of their ages will be ${nA / g}:${nB / g}. What is the present age of the elder friend?`, correct: `${Math.max(ageA, ageB)} years`, wrong: near(Math.max(ageA, ageB), 2, [Math.min(ageA, ageB)]).map(value => `${value} years`), explanation: `Let the ages be ${a}x and ${b}x. Using the new ratio gives x = ${x}, so the elder friend is ${Math.max(ageA, ageB)} years old.` };
  } },
  { category: "quant", topic: "probability", difficulties: ["medium", "hard"], build: difficulty => {
    if (difficulty === "medium") {
      const n = ri(3, 5); const k = ri(1, n - 1);
      const ways = (() => { let c = 1; for (let i = 1; i <= k; i += 1) c = c * (n - i + 1) / i; return Math.round(c); })();
      return { topic: "probability", prompt: `A fair coin is tossed ${n} times. What is the probability of getting exactly ${k} head${k > 1 ? "s" : ""}?`, correct: fraction(ways, 2 ** n), wrong: shuffle([fraction(ways + 1, 2 ** n), fraction(k, n), fraction(ways, 2 ** (n - 1)), fraction(1, 2 ** n)].filter(value => value !== fraction(ways, 2 ** n))).slice(0, 3), explanation: `Ways = C(${n}, ${k}) = ${ways} out of ${2 ** n} equally likely outcomes, so ${fraction(ways, 2 ** n)}.` };
    }
    const target = ri(7, 11); let count = 0;
    for (let i = 1; i <= 6; i += 1) for (let j = 1; j <= 6; j += 1) if (i + j >= target) count += 1;
    return { topic: "probability", prompt: `Two fair dice are rolled. What is the probability that the sum is at least ${target}?`, correct: fraction(count, 36), wrong: shuffle([fraction(count + 1, 36), fraction(Math.max(1, count - 1), 36), fraction(count + 2, 36), fraction(Math.max(1, count - 2), 36)].filter(value => value !== fraction(count, 36))).slice(0, 3), explanation: `${count} of the 36 equally likely outcomes give a sum of ${target} or more, so ${fraction(count, 36)}.` };
  } },
  { category: "quant", topic: "data-interpretation", difficulties: ["medium", "hard"], build: () => {
    const q1 = ri(5, 20) * 10; const rise = pick([10, 20, 25, 30, 40, 50]); const q4 = q1 * (100 + rise) / 100;
    if (!Number.isInteger(q4)) return null;
    const mid1 = q1 + ri(1, 5) * 5; const mid2 = q1 + ri(1, 5) * 5;
    return { topic: "data-interpretation", prompt: `A team's sales across four quarters were ${q1}, ${mid1}, ${mid2} and ${q4} units. By what percentage did Q4 sales exceed Q1?`, correct: `${rise}%`, wrong: [`${rise + 5}%`, `${Math.max(5, rise - 5)}%`, `${rise + 10}%`], explanation: `Increase = (${q4} − ${q1}) / ${q1} × 100 = ${rise}%.` };
  } },
];

const WORDS = ["APPLE", "BRAVE", "CLOUD", "DREAM", "EARTH", "FLAME", "GRAPE", "HOUSE", "LIGHT", "MANGO", "NIGHT", "OCEAN", "PLANT", "RIVER", "STONE", "TIGER", "WATER", "YOUNG", "SMILE", "TRAIN"];
const shift = (word: string, steps: number[]) => [...word].map((ch, i) => String.fromCharCode((ch.charCodeAt(0) - 65 + steps[i % steps.length] + 26) % 26 + 65)).join("");
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const logical: Template[] = [
  { category: "logical", topic: "number-series", difficulties: ["easy", "medium", "hard"], build: difficulty => {
    const kind = pick(difficulty === "easy" ? ["add", "mul"] : difficulty === "medium" ? ["grow", "mulAdd", "square"] : ["fib", "mulAdd", "alt"]);
    const start = ri(2, 12); const terms: number[] = [start];
    let rule = "";
    if (kind === "add") { const d = ri(3, 12); for (let i = 1; i < 6; i += 1) terms.push(terms[i - 1] + d); rule = `Each term adds ${d}.`; }
    else if (kind === "mul") { const m = pick([2, 3]); for (let i = 1; i < 6; i += 1) terms.push(terms[i - 1] * m); rule = `Each term is multiplied by ${m}.`; }
    else if (kind === "grow") { let d = ri(1, 4); const step = ri(1, 3); for (let i = 1; i < 6; i += 1) { terms.push(terms[i - 1] + d); d += step; } rule = `The gap between terms grows by ${step} each time.`; }
    else if (kind === "mulAdd") { const m = pick([2, 3]); const c = ri(1, 5) * (Math.random() < 0.5 ? 1 : -1); for (let i = 1; i < 6; i += 1) terms.push(terms[i - 1] * m + c); rule = `Each term is the previous × ${m} ${c >= 0 ? "+" : "−"} ${Math.abs(c)}.`; }
    else if (kind === "square") { const c = ri(1, 9); const s = ri(1, 5); for (let i = 0; i < 6; i += 1) terms[i] = (s + i) ** 2 + c; rule = `Each term is a square plus ${c}: ${s}², ${s + 1}², … each + ${c}.`; }
    else if (kind === "fib") { const second = ri(2, 9); terms.push(second); for (let i = 2; i < 6; i += 1) terms.push(terms[i - 1] + terms[i - 2]); rule = "Each term is the sum of the two terms before it."; }
    else { const a = ri(2, 6); const b = ri(7, 12); for (let i = 1; i < 6; i += 1) terms.push(terms[i - 1] + (i % 2 ? a : b)); rule = `The terms alternately add ${a} and ${b}.`; }
    const answer = terms[5]; const shown = terms.slice(0, 5).join(", ");
    if (new Set(terms).size !== terms.length || answer > 100000 || terms.some(term => term <= 0)) return null;
    return { topic: "number-series", prompt: `Find the next number: ${shown}, ?`, correct: String(answer), wrong: near(answer, Math.max(1, Math.round((terms[4] - terms[3]) / 2) || 1), [terms[4] + (terms[4] - terms[3])]).map(String), explanation: rule };
  } },
  { category: "logical", topic: "coding-decoding", difficulties: ["easy", "medium", "hard"], build: difficulty => {
    const w1 = pick(WORDS); const w2 = pick(WORDS.filter(word => word !== w1));
    if (difficulty === "hard") {
      const up = ri(1, 3); const down = ri(1, 3); const right = shift(w2, [up, -down]);
      return { topic: "coding-decoding", prompt: `In a code, letters of ${w1} are written as ${shift(w1, [up, -down])} (alternately moving ${up} forward and ${down} back). How is ${w2} written in the same code?`, correct: right, wrong: [shift(w2, [up, up]), shift(w2, [-down, up]), shift(w2, [up + 1, -down])], explanation: `Letters 1, 3, 5 move ${up} forward; letters 2, 4 move ${down} back. Applied to ${w2} this gives ${right}.` };
    }
    const k = ri(1, difficulty === "easy" ? 2 : 4); const right = shift(w2, [k]);
    return { topic: "coding-decoding", prompt: `If ${w1} is written as ${shift(w1, [k])}, how is ${w2} written in the same code?`, correct: right, wrong: [shift(w2, [k + 1]), shift(w2, [k - 1]), shift(w2, [-k])], explanation: `Every letter moves ${k} step${k > 1 ? "s" : ""} forward in the alphabet, so ${w2} becomes ${right}.` };
  } },
  { category: "logical", topic: "directions", difficulties: ["easy", "medium", "hard"], build: () => {
    const [a, b, c] = pick([[3, 4, 5], [6, 8, 10], [5, 12, 13], [9, 12, 15], [8, 15, 17]] as const);
    const extra = ri(2, 9); const back = ri(2, 7); const name = pick(NAMES);
    const legs = shuffle([`${b + extra} km north`, `${a} km east`, `${extra} km south`]);
    const tail = Math.random() < 0.5 ? [`${back} km west`, `${back} km east`] : [];
    return { topic: "directions", prompt: `${name} walks ${[...legs, ...tail].join(", then ")}. How far is ${name} from the starting point?`, correct: `${c} km`, wrong: [`${a + b} km`, `${c + 2} km`, `${Math.abs(b - a)} km`].filter(value => value !== `${c} km`), explanation: `Net movement is ${b} km north and ${a} km east, so the distance is √(${a}² + ${b}²) = ${c} km.` };
  } },
  { category: "logical", topic: "ranking", difficulties: ["easy", "medium"], build: difficulty => {
    const total = ri(20, 60); const fromLeft = ri(4, total - 4); const name = pick(NAMES);
    if (difficulty === "easy") return { topic: "ranking", prompt: `In a row of ${total} students, ${name} is ${fromLeft}th from the left. What is ${name}'s position from the right?`, correct: `${total - fromLeft + 1}`, wrong: near(total - fromLeft + 1, 1, [total - fromLeft]).map(String), explanation: `Position from the right = ${total} − ${fromLeft} + 1 = ${total - fromLeft + 1}.` };
    const fromRight = total - fromLeft + 1;
    return { topic: "ranking", prompt: `${name} ranks ${fromLeft}th from the top and ${fromRight}th from the bottom in a class. How many students are in the class?`, correct: String(total), wrong: near(total, 1, [fromLeft + fromRight]).map(String), explanation: `Total = ${fromLeft} + ${fromRight} − 1 = ${total}. One person is counted in both ranks.` };
  } },
  { category: "logical", topic: "odd-one-out", difficulties: ["easy", "medium"], build: () => {
    const k = pick([3, 4, 6, 7, 9]); const group = [ri(2, 12), ri(13, 24), ri(25, 40), ri(41, 60)].map(value => value * k);
    const odd = pick(group) + ri(1, k - 1); const set = shuffle([...group, odd]);
    return { topic: "odd-one-out", prompt: `Four of these numbers are multiples of ${k}. Which one is the odd one out? ${set.join(", ")}`, correct: String(odd), wrong: group.slice(0, 3).map(String), explanation: `${set.filter(value => value !== odd).join(", ")} are all multiples of ${k}; ${odd} is not.` };
  } },
  { category: "logical", topic: "calendar", difficulties: ["easy", "medium"], build: difficulty => {
    const start = ri(0, 6); const n = difficulty === "easy" ? ri(10, 60) : ri(100, 900);
    const end = (start + n) % 7;
    return { topic: "calendar", prompt: `Today is ${DAYS[start]}. What day of the week will it be after ${n} days?`, correct: DAYS[end], wrong: [DAYS[(end + 1) % 7], DAYS[(end + 6) % 7], DAYS[(end + 3) % 7]], explanation: `${n} ÷ 7 leaves a remainder of ${n % 7}, so move ${n % 7} day${n % 7 === 1 ? "" : "s"} on from ${DAYS[start]}: ${DAYS[end]}.` };
  } },
  { category: "logical", topic: "clocks", difficulties: ["medium", "hard"], build: () => {
    const h = ri(1, 11); const m = pick([10, 15, 20, 30, 40, 45, 50]);
    const raw = Math.abs(30 * h - 5.5 * m); const angle = raw > 180 ? 360 - raw : raw;
    const fmt = (value: number) => `${num(value)}°`;
    return { topic: "clocks", prompt: `What is the smaller angle between the hour and minute hands of a clock at ${h}:${String(m).padStart(2, "0")}?`, correct: fmt(angle), wrong: [fmt(angle + 15), fmt(Math.max(5, angle - 15)), fmt(Math.abs(30 * h - 6 * m) % 180 || 30)].filter(value => value !== fmt(angle)), explanation: `Angle = |30 × ${h} − 5.5 × ${m}| = ${num(raw)}°${raw > 180 ? `, and the smaller angle is 360° − ${num(raw)}° = ${num(angle)}°` : ""}.` };
  } },
];

type Vocab = [word: string, synonym: string, antonym: string, other1: string, other2: string];
const VOCAB: Vocab[] = [
  ["pragmatic", "practical", "idealistic", "careless", "gloomy"], ["candid", "frank", "secretive", "polite", "nervous"], ["meticulous", "careful", "sloppy", "famous", "gentle"],
  ["resilient", "tough", "fragile", "curious", "lazy"], ["benevolent", "kind", "cruel", "wealthy", "shy"], ["scarce", "rare", "plentiful", "ancient", "loud"],
  ["diligent", "hardworking", "idle", "rude", "calm"], ["obsolete", "outdated", "modern", "empty", "costly"], ["ambiguous", "unclear", "obvious", "cheerful", "rigid"],
  ["frugal", "thrifty", "wasteful", "greedy", "sleepy"], ["lucid", "clear", "confusing", "bright", "loyal"], ["tenacious", "persistent", "yielding", "talkative", "proud"],
  ["vivid", "striking", "dull", "swift", "bitter"], ["abundant", "plentiful", "scarce", "heavy", "quiet"], ["hostile", "unfriendly", "friendly", "curious", "weak"],
  ["inevitable", "unavoidable", "avoidable", "pleasant", "sudden"], ["mundane", "ordinary", "extraordinary", "ancient", "noisy"], ["verbose", "wordy", "concise", "angry", "clever"],
  ["reluctant", "unwilling", "eager", "tired", "jealous"], ["serene", "calm", "agitated", "distant", "elegant"], ["trivial", "minor", "significant", "private", "costly"],
  ["viable", "workable", "impractical", "fragile", "silent"], ["zealous", "enthusiastic", "apathetic", "dishonest", "lonely"], ["prudent", "wise", "reckless", "wealthy", "mild"],
  ["catalyst", "trigger", "obstacle", "witness", "ending"], ["conceal", "hide", "reveal", "repair", "invite"], ["augment", "increase", "reduce", "protect", "describe"],
  ["mitigate", "lessen", "worsen", "delay", "explain"], ["feasible", "possible", "impossible", "tasty", "elegant"], ["lethargic", "sluggish", "energetic", "angry", "talented"],
];
const SPELLING: Array<[string, string, string, string]> = [
  ["Accommodate", "Accomodate", "Acommodate", "Accomadate"], ["Necessary", "Neccessary", "Necesary", "Neccesary"], ["Occurrence", "Occurence", "Ocurrence", "Occurrance"],
  ["Separate", "Seperate", "Separete", "Seprate"], ["Definitely", "Definately", "Definitly", "Defanitely"], ["Receive", "Recieve", "Receeve", "Receve"],
  ["Embarrass", "Embarass", "Embarras", "Embaress"], ["Environment", "Enviroment", "Environmant", "Envirenment"], ["Government", "Goverment", "Governmant", "Govermnent"],
  ["Independent", "Independant", "Independint", "Indepandent"], ["Knowledge", "Knowlege", "Knowledje", "Nowledge"], ["Maintenance", "Maintainance", "Maintenence", "Maintanence"],
  ["Millennium", "Milennium", "Millenium", "Milenium"], ["Privilege", "Priviledge", "Privelege", "Privilage"], ["Recommend", "Recomend", "Reccomend", "Recommand"],
  ["Schedule", "Schedual", "Shedule", "Scedule"], ["Tomorrow", "Tommorow", "Tomorow", "Tommorrow"], ["Weird", "Wierd", "Wired", "Weerd"],
  ["Conscientious", "Consciencious", "Conscientous", "Concientious"], ["Parallel", "Paralel", "Parralel", "Paralell"],
];
const SUBSTITUTION: Array<[clue: string, answer: string, a: string, b: string, c: string]> = [
  ["A person who walks in their sleep", "Somnambulist", "Insomniac", "Pedestrian", "Hypnotist"], ["A government by the few", "Oligarchy", "Democracy", "Monarchy", "Anarchy"],
  ["One who loves books", "Bibliophile", "Philanthropist", "Bibliographer", "Librarian"], ["A person who can speak many languages", "Polyglot", "Linguist", "Orator", "Translator"],
  ["Fear of open spaces", "Agoraphobia", "Claustrophobia", "Acrophobia", "Xenophobia"], ["A remedy for all diseases", "Panacea", "Antidote", "Placebo", "Tonic"],
  ["Words that cannot be read", "Illegible", "Inaudible", "Incorrigible", "Invisible"], ["One who hates mankind", "Misanthrope", "Philanthropist", "Pessimist", "Cynic"],
  ["A person who is new to a field", "Novice", "Veteran", "Expert", "Mentor"], ["Something that can be eaten", "Edible", "Eligible", "Legible", "Audible"],
  ["A person who looks at the bright side", "Optimist", "Pessimist", "Realist", "Egoist"], ["Speech delivered without preparation", "Extempore", "Rehearsed", "Monologue", "Sermon"],
  ["Killing of one's own brother", "Fratricide", "Patricide", "Suicide", "Regicide"], ["A place where birds are kept", "Aviary", "Apiary", "Aquarium", "Nursery"],
  ["A study of ancient things", "Archaeology", "Anthropology", "Astrology", "Geology"], ["Incapable of being corrected", "Incorrigible", "Illegible", "Inevitable", "Indelible"],
];

const verbal: Template[] = [
  { category: "verbal", topic: "vocabulary", difficulties: ["easy", "medium"], build: () => {
    const [word, synonym, antonym, other1, other2] = pick(VOCAB);
    if (Math.random() < 0.5) return { topic: "vocabulary", prompt: `Choose the word closest in meaning to '${word}'.`, correct: synonym, wrong: [antonym, other1, other2], explanation: `'${word}' means ${synonym}.` };
    return { topic: "vocabulary", prompt: `Choose the word opposite in meaning to '${word}'.`, correct: antonym, wrong: [synonym, other1, other2], explanation: `The opposite of '${word}' is '${antonym}'.` };
  } },
  { category: "verbal", topic: "spelling", difficulties: ["easy", "medium"], build: () => {
    const [right, ...wrong] = pick(SPELLING);
    return { topic: "spelling", prompt: "Which of these is spelt correctly?", correct: right, wrong, explanation: `The correct spelling is '${right}'.` };
  } },
  { category: "verbal", topic: "one-word-substitution", difficulties: ["medium", "hard"], build: () => {
    const [clue, answer, a, b, c] = pick(SUBSTITUTION);
    return { topic: "one-word-substitution", prompt: `Choose the one word that stands for: ${clue}.`, correct: answer, wrong: [a, b, c], explanation: `${clue} is called '${answer}'.` };
  } },
];

// ───────────────────────── More quantitative topics ─────────────────────────
const fact = (n: number): number => (n <= 1 ? 1 : n * fact(n - 1));
const comb = (n: number, r: number) => fact(n) / (fact(r) * fact(n - r));
const powMod = (base: number, exp: number, mod: number) => Number(BigInt(base) ** BigInt(exp) % BigInt(mod));

quant.push(
  { category: "quant", topic: "compound-interest", difficulties: ["medium", "hard"], build: difficulty => {
    const principal = ri(1, 20) * 1000;
    if (difficulty === "medium") {
      const r = pick([10, 20]); const ci = Math.round(principal * ((1 + r / 100) ** 2 - 1));
      return { topic: "compound-interest", prompt: `What is the compound interest on ${inr(principal)} for 2 years at ${r}% per annum, compounded yearly?`, correct: inr(ci), wrong: [inr(principal * r * 2 / 100), inr(ci + principal / 20), inr(Math.max(100, ci - principal / 20))], explanation: `Amount = ${principal} × (1 + ${r}/100)² = ${inr(principal + ci)}. Interest = ${inr(ci)}. Simple interest would be ${inr(principal * r * 2 / 100)}.` };
    }
    const amount = Math.round(principal * 1.331);
    return { topic: "compound-interest", prompt: `A sum of ${inr(principal)} is invested at 10% per annum compound interest. What will it amount to after 3 years?`, correct: inr(amount), wrong: [inr(principal * 1.3), inr(principal * 1.33), inr(principal * 1.21)], explanation: `Amount = ${principal} × 1.1³ = ${principal} × 1.331 = ${inr(amount)}.` };
  } },
  { category: "quant", topic: "boats-and-streams", difficulties: ["easy", "medium", "hard"], build: difficulty => {
    const boat = ri(6, 20); const stream = ri(1, Math.min(5, boat - 2));
    if (difficulty === "easy") return { topic: "boats-and-streams", prompt: `A boat goes ${boat} km/h in still water and the stream flows at ${stream} km/h. What is its speed downstream?`, correct: `${boat + stream} km/h`, wrong: [`${boat - stream} km/h`, `${boat} km/h`, `${boat + stream + 2} km/h`], explanation: `Downstream speed = ${boat} + ${stream} = ${boat + stream} km/h.` };
    if (difficulty === "medium") { const k = ri(2, 6); const dist = (boat + stream) * k; return { topic: "boats-and-streams", prompt: `A boat that goes ${boat} km/h in still water travels ${dist} km downstream in a river flowing at ${stream} km/h. How long does it take?`, correct: unit(k, "hour"), wrong: near(k, 1, [Math.round(dist / boat)]).map(value => unit(value, "hour")), explanation: `Downstream speed = ${boat + stream} km/h, so time = ${dist}/${boat + stream} = ${k} hours.` }; }
    const down = boat + stream; const up = boat - stream;
    return { topic: "boats-and-streams", prompt: `A boat covers a stretch of river at ${down} km/h downstream and ${up} km/h upstream. What is the speed of the stream?`, correct: `${stream} km/h`, wrong: near(stream, 1, [boat]).map(value => `${value} km/h`), explanation: `Stream speed = (downstream − upstream)/2 = (${down} − ${up})/2 = ${stream} km/h.` };
  } },
  { category: "quant", topic: "pipes-and-cisterns", difficulties: ["easy", "medium", "hard"], build: difficulty => {
    if (difficulty === "hard") {
      const [a, c, net] = pick([[6, 9, 18], [4, 6, 12], [10, 15, 30], [12, 18, 36], [8, 12, 24], [3, 6, 6], [5, 10, 10], [9, 12, 36]] as const);
      return { topic: "pipes-and-cisterns", prompt: `A pipe fills a tank in ${a} hours, but a leak at the bottom empties it in ${c} hours. If both are open, how long does the tank take to fill?`, correct: unit(net, "hour"), wrong: near(net, 2, [a + c, c - a]).map(value => unit(value, "hour")), explanation: `Net rate = 1/${a} − 1/${c} = 1/${net} of the tank an hour, so ${net} hours.` };
    }
    const [a, b, both] = pick([[12, 24, 8], [10, 15, 6], [20, 30, 12], [15, 30, 10], [18, 9, 6], [40, 60, 24], [30, 45, 18], [12, 6, 4]] as const);
    return { topic: "pipes-and-cisterns", prompt: `Two pipes can fill a tank in ${a} hours and ${b} hours. If both are opened together, how long will it take to fill the empty tank?`, correct: unit(both, "hour"), wrong: near(both, 1, [Math.round((a + b) / 2)]).map(value => unit(value, "hour")), explanation: `Together: 1/${a} + 1/${b} = 1/${both} of the tank an hour, so ${both} hours.` };
  } },
  { category: "quant", topic: "trains", difficulties: ["easy", "medium", "hard"], build: difficulty => {
    const k = ri(1, 6); const speed = 18 * k; const t = ri(5, 30);
    if (difficulty === "easy") { const length = 5 * k * t; return { topic: "trains", prompt: `A train running at ${speed} km/h passes a pole in ${t} seconds. What is the length of the train?`, correct: `${length} m`, wrong: near(length, 5 * k, [speed * t]).map(value => `${value} m`), explanation: `Speed = ${speed} × 5/18 = ${5 * k} m/s. Length = ${5 * k} × ${t} = ${length} m.` }; }
    if (difficulty === "medium") { const train = 5 * k * ri(4, 12); const platform = 5 * k * ri(4, 12); const time = (train + platform) / (5 * k); return { topic: "trains", prompt: `A ${train} m long train running at ${speed} km/h crosses a platform ${platform} m long. How many seconds does it take?`, correct: `${time} seconds`, wrong: near(time, 2, [Math.round(train / (5 * k))]).map(value => `${value} seconds`), explanation: `Distance = ${train} + ${platform} = ${train + platform} m at ${5 * k} m/s, so ${time} seconds.` }; }
    const s1 = 18 * ri(1, 3); const s2 = 18 * ri(1, 3); const sec = ri(3, 10); const total = (s1 + s2) * 5 / 18 * sec; const l1 = Math.round(total * 0.4 / 5) * 5; const l2 = total - l1;
    if (l1 <= 0 || l2 <= 0) return null;
    return { topic: "trains", prompt: `Two trains of length ${l1} m and ${l2} m run towards each other at ${s1} km/h and ${s2} km/h on parallel tracks. How long do they take to pass each other completely?`, correct: `${sec} seconds`, wrong: near(sec, 1, [Math.round(total / (s1 * 5 / 18))]).map(value => `${value} seconds`), explanation: `Relative speed = ${s1 + s2} km/h = ${(s1 + s2) * 5 / 18} m/s. Distance = ${l1} + ${l2} = ${total} m, so ${sec} seconds.` };
  } },
  { category: "quant", topic: "hcf-lcm", difficulties: ["easy", "medium", "hard"], build: difficulty => {
    const h = ri(2, 12); const coprime: Array<[number, number]> = [[2, 3], [3, 4], [3, 5], [4, 5], [2, 5], [5, 6], [3, 7], [4, 7], [5, 7]]; const [a, b] = pick(coprime); const x = h * a; const y = h * b;
    if (difficulty === "easy") return { topic: "hcf-lcm", prompt: `What is the HCF of ${x} and ${y}?`, correct: String(h), wrong: near(h, 1, [h * 2]).map(String), explanation: `${x} = ${h} × ${a} and ${y} = ${h} × ${b}, and ${a}, ${b} share no factor, so the HCF is ${h}.` };
    if (difficulty === "medium") return { topic: "hcf-lcm", prompt: `What is the LCM of ${x} and ${y}?`, correct: String(h * a * b), wrong: near(h * a * b, h, [x * y]).map(String), explanation: `LCM = ${h} × ${a} × ${b} = ${h * a * b}.` };
    return { topic: "hcf-lcm", prompt: `The HCF of two numbers is ${h} and their LCM is ${h * a * b}. If one number is ${x}, what is the other?`, correct: String(y), wrong: near(y, h, [h * a * b]).map(String), explanation: `Product of the numbers = HCF × LCM, so the other number = ${h} × ${h * a * b} / ${x} = ${y}.` };
  } },
  { category: "quant", topic: "number-system", difficulties: ["easy", "medium", "hard"], build: difficulty => {
    if (difficulty === "easy") { const n = ri(10, 60); const sum = n * (n + 1) / 2; return { topic: "number-system", prompt: `What is the sum of the first ${n} natural numbers?`, correct: String(sum), wrong: near(sum, n, [n * n]).map(String), explanation: `Sum = n(n+1)/2 = ${n} × ${n + 1} / 2 = ${sum}.` }; }
    if (difficulty === "medium") { const k = pick([3, 4, 6, 7, 9, 11]); const lo = ri(10, 60); const hi = lo + ri(60, 240); const count = Math.floor(hi / k) - Math.floor((lo - 1) / k); return { topic: "number-system", prompt: `How many multiples of ${k} are there from ${lo} to ${hi}, both included?`, correct: String(count), wrong: near(count, 1, [Math.round((hi - lo) / k)]).map(String), explanation: `⌊${hi}/${k}⌋ − ⌊${lo - 1}/${k}⌋ = ${Math.floor(hi / k)} − ${Math.floor((lo - 1) / k)} = ${count}.` }; }
    const base = ri(2, 9); const exp = ri(12, 99); const digit = powMod(base, exp, 10);
    const cycle: number[] = []; for (let power = 1; power <= 4; power += 1) { const next = powMod(base, power, 10); if (cycle.includes(next)) break; cycle.push(next); }
    return { topic: "number-system", prompt: `What is the units digit of ${base}^${exp}?`, correct: String(digit), wrong: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter(value => value !== digit).sort(() => Math.random() - 0.5).slice(0, 3).map(String), explanation: `The units digits of powers of ${base} repeat in the cycle ${cycle.join(", ")}. ${exp} is at position ${(exp - 1) % cycle.length + 1} of that cycle, which gives ${digit}.` };
  } },
  { category: "quant", topic: "mensuration", difficulties: ["easy", "medium", "hard"], build: difficulty => {
    if (difficulty === "easy") { const l = ri(6, 30); const w = ri(3, l - 1); return { topic: "mensuration", prompt: `A rectangular field is ${l} m long and ${w} m wide. What is its perimeter?`, correct: `${2 * (l + w)} m`, wrong: [`${l * w} m`, `${l + w} m`, `${2 * (l + w) + 4} m`], explanation: `Perimeter = 2 × (${l} + ${w}) = ${2 * (l + w)} m.` }; }
    if (difficulty === "medium") { const r = 7 * ri(1, 6); const area = 22 * r * r / 7; return { topic: "mensuration", prompt: `Using π = 22/7, what is the area of a circle of radius ${r} cm?`, correct: `${area} cm²`, wrong: [`${2 * 22 * r / 7} cm²`, `${area + 22} cm²`, `${area * 2} cm²`], explanation: `Area = πr² = 22/7 × ${r}² = ${area} cm².` }; }
    const x = pick([10, 20, 25, 50]); const y = pick([10, 20, 25, 50]); const change = (100 + x) * (100 - y) / 100 - 100;
    return { topic: "mensuration", prompt: `The length of a rectangle is increased by ${x}% and its breadth is decreased by ${y}%. What is the percentage change in its area?`, correct: `${num(change)}%`, wrong: [`${num(x - y)}%`, `${num(change + 5)}%`, `${num(change - 5)}%`], explanation: `New area = ${(100 + x) / 100} × ${(100 - y) / 100} = ${num((100 + x) * (100 - y) / 10000)} of the old, a change of ${num(change)}%.` };
  } },
  { category: "quant", topic: "partnership", difficulties: ["medium", "hard"], build: difficulty => {
    const a = ri(2, 9) * 1000; const b = ri(2, 9) * 1000; if (a === b) return null;
    const t1 = difficulty === "hard" ? ri(4, 12) : 12; const t2 = difficulty === "hard" ? ri(4, 12) : 12; const ra = a * t1 / 1000; const rb = b * t2 / 1000; const sum = ra + rb;
    const profit = sum * ri(2, 9) * 100; const share = profit * ra / sum;
    const [n1, n2] = shuffle(NAMES).slice(0, 2);
    return { topic: "partnership", prompt: `${n1} invests ${inr(a)} for ${t1} months and ${n2} invests ${inr(b)} for ${t2} months. They earn a profit of ${inr(profit)}. What is ${n1}'s share?`, correct: inr(share), wrong: [inr(profit - share), inr(profit / 2), inr(share + profit / 10)], explanation: `Profit is shared in the ratio of investment × time: ${a * t1} : ${b * t2} = ${ra} : ${rb}. ${n1} gets ${inr(share)}.` };
  } },
  { category: "quant", topic: "mixtures", difficulties: ["medium", "hard"], build: () => {
    const [a, b] = pick([[3, 2], [2, 1], [3, 1], [4, 1], [5, 3], [3, 4]] as const); const k = ri(2, 12); const c = b + ri(1, 3);
    const total = (a + b) * k; const add = (c - b) * k;
    return { topic: "mixtures", prompt: `A ${total} litre mixture contains milk and water in the ratio ${a}:${b}. How much water must be added to make the ratio ${a}:${c}?`, correct: `${add} litres`, wrong: near(add, k, [total - add]).map(value => `${value} litres`), explanation: `Milk = ${a * k} L and water = ${b * k} L. For ${a}:${c}, water must be ${c * k} L, so add ${c * k} − ${b * k} = ${add} L.` };
  } },
  { category: "quant", topic: "permutations-combinations", difficulties: ["easy", "medium", "hard"], build: difficulty => {
    if (difficulty === "easy") { const n = ri(4, 9); const r = ri(2, 3); const ways = comb(n, r); return { topic: "permutations-combinations", prompt: `In how many ways can a committee of ${r} be chosen from ${n} people?`, correct: String(ways), wrong: near(ways, Math.max(1, Math.round(ways / 5)), [fact(n) / fact(n - r)]).map(String), explanation: `C(${n}, ${r}) = ${ways}.` }; }
    const word = pick(["LOGIC", "PLANET", "MARKET", "BRIDGE", "APPLE", "LETTER", "BANANA", "PEPPER", "BOOKS", "SCHOOL"]);
    const counts = new Map<string, number>(); for (const ch of word) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    const ways = [...counts.values()].reduce((value, c) => value / fact(c), fact(word.length));
    return { topic: "permutations-combinations", prompt: `In how many different ways can the letters of the word ${word} be arranged?`, correct: String(ways), wrong: near(ways, Math.max(1, Math.round(ways / 6)), [fact(word.length)]).map(String), explanation: `${[`${word.length}!`, ...[...counts.values()].filter(c => c > 1).map(c => `÷ ${c}!`)].join(" ")} = ${ways}.` };
  } },
  { category: "quant", topic: "simplification", difficulties: ["easy", "medium"], build: difficulty => {
    const pctA = pick([5, 10, 20, 25, 40, 50]); const pctB = pick([5, 10, 20, 25, 40, 50]); const x = ri(2, 40) * 20; const y = ri(2, 40) * 20;
    const result = pctA * x / 100 + pctB * y / 100;
    return { topic: "simplification", prompt: difficulty === "easy" ? `What is ${pctA}% of ${x} plus ${pctB}% of ${y}?` : `Find the value of ${pctA}% of ${x} + ${pctB}% of ${y} − 12.`, correct: String(difficulty === "easy" ? result : result - 12), wrong: near(difficulty === "easy" ? result : result - 12, 4, [pctA * x / 100]).map(String), explanation: `${pctA}% of ${x} = ${pctA * x / 100} and ${pctB}% of ${y} = ${pctB * y / 100}${difficulty === "easy" ? `, giving ${result}.` : `, so ${result} − 12 = ${result - 12}.`}` };
  } },
);

// ───────────────────────── More logical topics ─────────────────────────
const RELATIONS: Array<{ text: (p: string, q: string, r: string) => string; answer: string }> = [
  { text: (p, q, r) => `${p} is the brother of ${q}. ${q} is the mother of ${r}. How is ${p} related to ${r}?`, answer: "Maternal uncle" },
  { text: (p, q, r) => `${p} is the father of ${q}. ${q} is the sister of ${r}. How is ${p} related to ${r}?`, answer: "Father" },
  { text: (p, q, r) => `${p} is the mother of ${q}. ${q} is the father of ${r}. How is ${p} related to ${r}?`, answer: "Grandmother" },
  { text: (p, q, r) => `${p} is the sister of ${q}. ${q} is the father of ${r}. How is ${p} related to ${r}?`, answer: "Paternal aunt" },
  { text: (p, q, r) => `${p} is the son of ${q}. ${q} is the sister of ${r}. How is ${p} related to ${r}?`, answer: "Nephew" },
  { text: (p, q, r) => `${p} is the daughter of ${q}. ${q} is the brother of ${r}. How is ${p} related to ${r}?`, answer: "Niece" },
  { text: (p, q, r) => `${p} is the wife of ${q}. ${q} is the brother of ${r}. How is ${p} related to ${r}?`, answer: "Sister-in-law" },
  { text: (p, q, r) => `${p} is the father of ${q}. ${q} is the son of ${r}. How is ${p} related to ${r}?`, answer: "Husband" },
];
const RELATION_OPTIONS = ["Maternal uncle", "Father", "Grandmother", "Paternal aunt", "Nephew", "Niece", "Sister-in-law", "Husband", "Cousin", "Brother-in-law", "Grandfather", "Mother"];
const NOUNS = ["pens", "books", "tables", "chairs", "lamps", "phones", "cars", "roads", "birds", "trees", "flowers", "rivers", "doctors", "teachers", "players", "artists"];
const SYLLOGISMS = [
  { s1: (a: string, b: string) => `All ${a} are ${b}.`, s2: (_a: string, b: string, c: string) => `Some ${b} are ${c}.`, c1: (a: string, _b: string, c: string) => `Some ${a} are ${c}.`, c2: (_a: string, b: string, c: string) => `Some ${c} are ${b}.`, answer: "Only conclusion II follows" },
  { s1: (a: string, b: string) => `All ${a} are ${b}.`, s2: (_a: string, b: string, c: string) => `All ${b} are ${c}.`, c1: (a: string, _b: string, c: string) => `All ${a} are ${c}.`, c2: (a: string, _b: string, c: string) => `Some ${c} are ${a}.`, answer: "Both conclusions follow" },
  { s1: (a: string, b: string) => `Some ${a} are ${b}.`, s2: (_a: string, b: string, c: string) => `All ${b} are ${c}.`, c1: (a: string, _b: string, c: string) => `Some ${a} are ${c}.`, c2: (a: string, _b: string, c: string) => `All ${a} are ${c}.`, answer: "Only conclusion I follows" },
  { s1: (a: string, b: string) => `No ${a} are ${b}.`, s2: (a: string, _b: string, c: string) => `All ${c} are ${a}.`, c1: (_a: string, b: string, c: string) => `No ${c} are ${b}.`, c2: (_a: string, b: string, c: string) => `Some ${c} are ${b}.`, answer: "Only conclusion I follows" },
  { s1: (a: string, b: string) => `All ${a} are ${b}.`, s2: (_a: string, b: string, c: string) => `No ${b} are ${c}.`, c1: (a: string, _b: string, c: string) => `No ${a} are ${c}.`, c2: (a: string, _b: string, c: string) => `Some ${a} are ${c}.`, answer: "Only conclusion I follows" },
  { s1: (a: string, b: string) => `Some ${a} are ${b}.`, s2: (_a: string, b: string, c: string) => `Some ${b} are ${c}.`, c1: (a: string, _b: string, c: string) => `Some ${a} are ${c}.`, c2: (a: string, b: string) => `Some ${b} are ${a}.`, answer: "Only conclusion II follows" },
];
const SYLLOGISM_OPTIONS = ["Only conclusion I follows", "Only conclusion II follows", "Both conclusions follow", "Neither conclusion follows"];

logical.push(
  { category: "logical", topic: "blood-relations", difficulties: ["medium", "hard"], build: () => {
    const [p, q, r] = shuffle(NAMES).slice(0, 3); const relation = pick(RELATIONS);
    return { topic: "blood-relations", prompt: relation.text(p, q, r), correct: relation.answer, wrong: shuffle(RELATION_OPTIONS.filter(option => option !== relation.answer)).slice(0, 3), explanation: `Follow the chain from ${p} to ${r}: the answer is ${relation.answer.toLowerCase()}.` };
  } },
  { category: "logical", topic: "syllogisms", difficulties: ["medium", "hard"], build: () => {
    const [a, b, c] = shuffle(NOUNS).slice(0, 3); const rule = pick(SYLLOGISMS);
    return { topic: "syllogisms", prompt: `Statements: ${rule.s1(a, b)} ${rule.s2(a, b, c)} Conclusions: I. ${rule.c1(a, b, c)} II. ${rule.c2(a, b, c)} Which of the following follows?`, correct: rule.answer, wrong: SYLLOGISM_OPTIONS.filter(option => option !== rule.answer), explanation: `Taking the two statements together: ${rule.answer}.` };
  } },
  { category: "logical", topic: "seating-arrangement", difficulties: ["easy", "medium"], build: difficulty => {
    const people = shuffle(NAMES).slice(0, 5); const clues = people.slice(0, -1).map((name, index) => `${name} sits immediately to the left of ${people[index + 1]}.`);
    const shown = difficulty === "easy" ? clues : [...clues.slice(0, 3), `${people[4]} sits at the right end.`];
    const middleKnown = difficulty === "easy" ? people[2] : people[2];
    return { topic: "seating-arrangement", prompt: `Five people sit in a row facing north. ${shuffle(shown).join(" ")} Who sits in the middle?`, correct: middleKnown, wrong: [people[1], people[3], difficulty === "easy" ? people[0] : people[4]], explanation: `Putting the clues together gives the order ${people.join(", ")} from left to right, so ${middleKnown} is in the middle.` };
  } },
  { category: "logical", topic: "analogies", difficulties: ["easy", "medium", "hard"], build: difficulty => {
    const n = ri(2, 12); const rules: Array<[string, (value: number) => number]> = difficulty === "easy" ? [["is squared", v => v * v], ["is doubled and increased by 1", v => 2 * v + 1]] : difficulty === "medium" ? [["is cubed", v => v ** 3], ["is multiplied by the next number", v => v * (v + 1)]] : [["is squared and then reduced by 1", v => v * v - 1], ["is cubed and then increased by the number", v => v ** 3 + v]];
    const [description, fn] = pick(rules); const m = n + ri(1, 4); const answer = fn(m);
    return { topic: "analogies", prompt: `Find the missing number: ${n} : ${fn(n)} :: ${m} : ?`, correct: String(answer), wrong: near(answer, Math.max(1, Math.round(answer / 10))).map(String), explanation: `In the first pair the number ${description}, so ${m} gives ${answer}.` };
  } },
  { category: "logical", topic: "letter-series", difficulties: ["easy", "medium", "hard"], build: difficulty => {
    const gap = difficulty === "easy" ? ri(2, 3) : difficulty === "medium" ? 1 : 2; const grow = difficulty === "easy" ? 0 : 1; const start = ri(1, 4);
    const positions = [start]; let step = gap; for (let i = 1; i < 6; i += 1) { positions.push(positions[i - 1] + step); step += grow; }
    if (positions[5] > 26) return null;
    const letter = (position: number) => String.fromCharCode(64 + position);
    return { topic: "letter-series", prompt: `Which letter comes next? ${positions.slice(0, 5).map(letter).join(", ")}, ?`, correct: letter(positions[5]), wrong: [positions[5] + 1, positions[5] - 1, positions[5] + 2].filter(value => value >= 1 && value <= 26).map(letter), explanation: grow ? `The gap between letters grows by ${grow} each step, so the next letter is ${letter(positions[5])}.` : `The letters move ${gap} places each time, so the next letter is ${letter(positions[5])}.` };
  } },
);

// ───────────────────────── More verbal topics ─────────────────────────
const AGREEMENT: Array<[string, boolean]> = [
  ["Each of the students", true], ["Neither of the reports", true], ["The manager along with her team", true], ["The quality of the products", true], ["A number of applicants", false], ["Both of the engineers", false],
  ["The committee", true], ["Many a student", true], ["Everyone in the audience", true], ["The staff in the office", false], ["The news from the front", true], ["Either of the two answers", true],
  ["The books on the shelf", false], ["One of the best players", true], ["The team and its coach", false], ["Mathematics", true], ["The children", false], ["Neither the teacher nor the students", false],
];
const AGREEMENT_FRAMES = ["{s} {v} ready for the review.", "{s} {v} expected to arrive soon.", "{s} {v} going to be announced tomorrow.", "{s} {v} important for the final decision."];
const PREPOSITIONS: Array<[string, string, string, string, string]> = [
  ["She is good ___ mathematics.", "at", "in", "on", "with"], ["He is afraid ___ heights.", "of", "from", "with", "at"], ["The meeting was postponed ___ Friday.", "until", "since", "by", "among"],
  ["I have been waiting ___ two hours.", "for", "since", "from", "during"], ["She is married ___ a doctor.", "to", "with", "by", "for"], ["They congratulated him ___ his promotion.", "on", "for", "at", "about"],
  ["He is allergic ___ peanuts.", "to", "with", "of", "from"], ["The cat jumped ___ the wall.", "over", "among", "between", "against"], ["She insisted ___ paying the bill.", "on", "to", "for", "at"],
  ["This book is different ___ the one I read.", "from", "than", "with", "of"], ["He has been living here ___ 2015.", "since", "for", "from", "during"], ["I prefer tea ___ coffee.", "to", "than", "over", "from"],
  ["The teacher divided the sweets ___ the children.", "among", "between", "with", "to"], ["She is interested ___ photography.", "in", "on", "at", "for"], ["He complained ___ the noise.", "about", "on", "from", "against"],
  ["We arrived ___ the airport early.", "at", "to", "in", "on"], ["The cake was shared ___ the two sisters.", "between", "among", "within", "over"], ["He apologised ___ being late.", "for", "on", "of", "at"],
];
const IDIOMS: Array<[string, string, string, string, string]> = [
  ["a piece of cake", "something very easy", "a slice of dessert", "a lucky chance", "a small gift"], ["break the ice", "start a conversation in an awkward setting", "break something frozen", "end an argument", "make a loud noise"],
  ["once in a blue moon", "very rarely", "every month", "at night", "suddenly"], ["hit the nail on the head", "say exactly the right thing", "make a mistake", "work very hard", "hurt oneself"],
  ["let the cat out of the bag", "reveal a secret", "free an animal", "make a mistake", "cause trouble"], ["under the weather", "feeling unwell", "standing in the rain", "very happy", "in danger"],
  ["burn the midnight oil", "work late into the night", "waste fuel", "start a fire", "sleep early"], ["cost an arm and a leg", "be very expensive", "cause an injury", "be a fair price", "be worth the effort"],
  ["spill the beans", "reveal a secret", "make a mess", "cook a meal", "lose money"], ["the ball is in your court", "it is your turn to act", "you are winning", "the game is over", "you must wait"],
  ["bite the bullet", "face a hard situation bravely", "eat quickly", "stay silent", "refuse an offer"], ["call it a day", "stop working for now", "celebrate a day", "start a new job", "cancel a plan"],
  ["a blessing in disguise", "something good that seemed bad at first", "a hidden danger", "a secret gift", "a lucky escape"], ["beat around the bush", "avoid the main point", "hit something hard", "go for a walk", "search carefully"],
  ["cut corners", "do something in the cheapest or quickest way", "make a sharp turn", "finish early", "damage property"], ["on cloud nine", "extremely happy", "very high up", "confused", "in a hurry"],
];
const CONFUSABLES: Array<[string, string, string, string, string]> = [
  ["The new policy will ___ everyone in the company.", "affect", "effect", "affects", "effects"], ["She gave me good ___ about my career.", "advice", "advise", "advices", "advised"], ["Everyone ___ Rahul has submitted the form.", "except", "accept", "expect", "excepts"],
  ["The school ___ addressed the students.", "principal", "principle", "principel", "principals"], ["It is a matter of ___, not money.", "principle", "principal", "principel", "principles"], ["Please buy some ___ for the office.", "stationery", "stationary", "stationry", "stationeries"],
  ["He decided to ___ the job offer.", "accept", "except", "expect", "excerpt"], ["The weather has a great ___ on my mood.", "effect", "affect", "affects", "effected"], ["They are ___ to win the match.", "likely", "liking", "alike", "liked"],
  ["She walked ___ the park every morning.", "through", "threw", "though", "thorough"], ["Please ___ your seat belt.", "fasten", "fasting", "fastened", "fastens"], ["He ___ the ball over the fence.", "threw", "through", "thrown", "throw"],
  ["I will meet you ___ the library.", "at", "in", "on", "by"], ["The company will ___ new staff next month.", "recruit", "recruits", "recruiting", "recruited"], ["Their team lost ___ match yesterday.", "its", "it's", "their", "there"],
];
const ANALOGY_SETS: Record<string, Array<[string, string]>> = {
  "Worker and tool": [["Doctor", "Stethoscope"], ["Painter", "Brush"], ["Farmer", "Plough"], ["Writer", "Pen"], ["Carpenter", "Hammer"], ["Tailor", "Needle"], ["Chef", "Knife"], ["Judge", "Gavel"]],
  "Animal and its young one": [["Dog", "Puppy"], ["Cat", "Kitten"], ["Cow", "Calf"], ["Horse", "Foal"], ["Sheep", "Lamb"], ["Duck", "Duckling"], ["Goat", "Kid"]],
  "Country and capital": [["India", "Delhi"], ["Japan", "Tokyo"], ["France", "Paris"], ["Italy", "Rome"], ["Egypt", "Cairo"], ["Kenya", "Nairobi"], ["Canada", "Ottawa"], ["Spain", "Madrid"]],
  "Animal and its home": [["Bird", "Nest"], ["Bee", "Hive"], ["Lion", "Den"], ["Horse", "Stable"], ["Spider", "Web"], ["Pig", "Sty"], ["Dog", "Kennel"]],
  "Word and opposite": [["Hot", "Cold"], ["Brave", "Cowardly"], ["Expand", "Shrink"], ["Ancient", "Modern"], ["Victory", "Defeat"], ["Generous", "Selfish"], ["Accept", "Refuse"]],
  "Quantity and its unit": [["Distance", "Kilometre"], ["Time", "Second"], ["Weight", "Kilogram"], ["Temperature", "Degree"], ["Power", "Watt"], ["Current", "Ampere"]],
};
const FRAMES_SENTENCE: Array<[string, string, string, string]> = [
  ["The team has completed its work ahead of schedule.", "The team have completed it's work ahead of schedule.", "The team has completed their work ahead of schedule's.", "The team have completed its work ahead off schedule."],
  ["She doesn't know the answer to this question.", "She don't know the answer to this question.", "She doesn't knows the answer to this question.", "She not know the answer to this question."],
  ["If I were you, I would accept the offer.", "If I was you, I will accept the offer.", "If I am you, I would accepted the offer.", "If I were you, I will accepting the offer."],
  ["Neither of the two options is suitable.", "Neither of the two options are suitable.", "Neither of the two option is suitable.", "Neither of the two options were suitable."],
  ["He has lived in Pune for ten years.", "He is living in Pune since ten years.", "He lives in Pune from ten years.", "He have lived in Pune for ten years."],
  ["The number of applicants has increased this year.", "The number of applicants have increased this year.", "The numbers of applicant has increased this year.", "The number of applicants are increased this year."],
  ["Each of the players receives a medal.", "Each of the players receive a medal.", "Each of the player receive a medal.", "Each of the players are receiving medal."],
  ["I look forward to meeting you next week.", "I look forward to meet you next week.", "I am looking forward for meeting you next week.", "I look forwards to meeting to you next week."],
];

verbal.push(
  { category: "verbal", topic: "subject-verb-agreement", difficulties: ["easy", "medium", "hard"], build: () => {
    const [subject, singular] = pick(AGREEMENT); const pair = pick([["is", "are"], ["has", "have"], ["was", "were"]] as const);
    const correct = singular ? pair[0] : pair[1]; const wrong = singular ? pair[1] : pair[0];
    const frame = pair[0] === "is" ? pick(AGREEMENT_FRAMES) : pair[0] === "has" ? "{s} {v} been noticed by everyone." : "{s} {v} present at the meeting yesterday.";
    const prompt = frame.replace("{s}", subject).replace("{v}", "___");
    const extras = pair[0] === "is" ? ["be", "being"] : pair[0] === "has" ? ["having", "be"] : ["been", "being"];
    const options = [correct, wrong, ...extras];
    return { topic: "subject-verb-agreement", prompt: `Fill in the blank: ${prompt}`, correct, wrong: options.filter(option => option !== correct), explanation: `${subject} takes a ${singular ? "singular" : "plural"} verb, so '${correct}' is correct.` };
  } },
  { category: "verbal", topic: "prepositions", difficulties: ["easy", "medium"], build: () => {
    const [frame, correct, ...wrong] = pick(PREPOSITIONS);
    return { topic: "prepositions", prompt: `Fill in the blank: ${frame}`, correct, wrong, explanation: `'${correct}' is the preposition that goes with this phrase.` };
  } },
  { category: "verbal", topic: "idioms", difficulties: ["medium", "hard"], build: () => {
    const [idiom, meaning, ...wrong] = pick(IDIOMS);
    return { topic: "idioms", prompt: `What does the idiom '${idiom}' mean?`, correct: meaning, wrong, explanation: `'${idiom}' means ${meaning}.` };
  } },
  { category: "verbal", topic: "commonly-confused-words", difficulties: ["medium", "hard"], build: () => {
    const [frame, correct, ...wrong] = pick(CONFUSABLES);
    return { topic: "commonly-confused-words", prompt: `Choose the word that fits the blank: ${frame}`, correct, wrong, explanation: `'${correct}' is the word that fits here.` };
  } },
  { category: "verbal", topic: "word-analogies", difficulties: ["easy", "medium"], build: () => {
    const relation = pick(Object.keys(ANALOGY_SETS)); const pairs = shuffle(ANALOGY_SETS[relation]);
    const [p1, p2, ...others] = pairs;
    return { topic: "word-analogies", prompt: `${p1[0]} : ${p1[1]} :: ${p2[0]} : ?`, correct: p2[1], wrong: others.map(pair => pair[1]).slice(0, 3), explanation: `Relationship: ${relation.toLowerCase()}. ${p1[0]} goes with ${p1[1]}, so ${p2[0]} goes with ${p2[1]}.` };
  } },
  { category: "verbal", topic: "sentence-correction", difficulties: ["medium", "hard"], build: () => {
    const [correct, ...wrong] = pick(FRAMES_SENTENCE);
    return { topic: "sentence-correction", prompt: "Choose the grammatically correct sentence.", correct, wrong, explanation: "This is the only sentence with correct agreement, tense and word choice." };
  } },
  { category: "verbal", topic: "tenses", difficulties: ["easy", "medium"], build: () => {
    const name = pick(NAMES); const years = ri(2, 15); const since = 2024 - years;
    const kind = ri(0, 2);
    if (kind === 0) return { topic: "tenses", prompt: `Fill in the blank: ${name} ___ in this company for ${years} years.`, correct: "has worked", wrong: ["is working", "worked", "had been work"], explanation: "'For' with a period up to now takes the present perfect: 'has worked'." };
    if (kind === 1) return { topic: "tenses", prompt: `Fill in the blank: ${name} ___ here since ${since}.`, correct: "has been living", wrong: ["is living", "lived", "was lived"], explanation: "'Since' with a starting year takes the present perfect continuous: 'has been living'." };
    return { topic: "tenses", prompt: `Fill in the blank: By the time we reached the station, the train ___.`, correct: "had left", wrong: ["has left", "leaves", "was leaving"], explanation: "An action finished before another past action takes the past perfect: 'had left'." };
  } },
);

VOCAB.push(
  ["eloquent", "articulate", "inarticulate", "generous", "reckless"], ["ephemeral", "short-lived", "permanent", "ancient", "fragile"], ["gregarious", "sociable", "reserved", "careless", "stubborn"],
  ["haphazard", "random", "organised", "violent", "expensive"], ["innovative", "original", "conventional", "tiny", "hasty"], ["jubilant", "joyful", "miserable", "curious", "polite"],
  ["lenient", "merciful", "strict", "weary", "vivid"], ["magnanimous", "generous", "petty", "sleepy", "formal"], ["nostalgic", "wistful", "indifferent", "bitter", "sturdy"],
  ["obstinate", "stubborn", "flexible", "polished", "nervous"], ["pensive", "thoughtful", "careless", "greedy", "festive"], ["quaint", "charming", "ordinary", "hostile", "sturdy"],
  ["robust", "sturdy", "weak", "cheap", "lively"], ["sagacious", "wise", "foolish", "wealthy", "tiny"], ["tranquil", "peaceful", "turbulent", "ancient", "tasty"],
  ["unanimous", "agreed by all", "divided", "silent", "random"], ["versatile", "adaptable", "limited", "rapid", "hollow"], ["wary", "cautious", "careless", "generous", "ancient"],
  ["adept", "skilled", "clumsy", "polite", "slim"], ["brevity", "shortness", "length", "honesty", "bravery"], ["clandestine", "secret", "open", "legal", "ancient"],
  ["debilitate", "weaken", "strengthen", "invite", "decorate"], ["exacerbate", "worsen", "improve", "explain", "borrow"], ["fortuitous", "lucky", "unlucky", "costly", "calm"],
  ["gullible", "easily fooled", "suspicious", "talented", "rude"], ["impartial", "fair", "biased", "lazy", "distant"], ["lucrative", "profitable", "unprofitable", "tasty", "quiet"],
  ["meagre", "scanty", "ample", "polite", "sudden"], ["notorious", "infamous", "respected", "colourful", "private"], ["opaque", "cloudy", "transparent", "soft", "bitter"],
);
SPELLING.push(
  ["Calendar", "Calender", "Calandar", "Calendre"], ["Committee", "Comittee", "Commitee", "Committe"], ["Existence", "Existance", "Existense", "Exsistence"],
  ["Guarantee", "Garantee", "Guarentee", "Gaurantee"], ["Harass", "Harrass", "Haras", "Harres"], ["Immediately", "Immediatly", "Imediately", "Immedietly"],
  ["Judgement", "Judgment", "Judgemant", "Jugdement"], ["Licence", "Lisence", "Licance", "Lisense"], ["Occasion", "Ocasion", "Occassion", "Occation"],
  ["Possession", "Posession", "Possesion", "Possestion"], ["Pronunciation", "Pronounciation", "Pronuciation", "Pronunsiation"], ["Questionnaire", "Questionaire", "Questionnair", "Quesstionnaire"],
  ["Rhythm", "Rythm", "Rhythem", "Rhythym"], ["Succeed", "Suceed", "Succede", "Sucseed"], ["Unnecessary", "Unecessary", "Unnecesary", "Unneccessary"],
);
SUBSTITUTION.push(
  ["One who is present everywhere", "Omnipresent", "Omniscient", "Omnipotent", "Ubiquitous"], ["A person who lives alone away from society", "Hermit", "Orphan", "Pilgrim", "Nomad"],
  ["A speech made by one person", "Monologue", "Dialogue", "Prologue", "Epilogue"], ["One who eats too much", "Glutton", "Gourmet", "Miser", "Vegan"],
  ["The study of birds", "Ornithology", "Entomology", "Zoology", "Ecology"], ["A person who does not believe in God", "Atheist", "Agnostic", "Pagan", "Heretic"],
  ["That which cannot be avoided", "Inevitable", "Invisible", "Incredible", "Inedible"], ["A life story written by oneself", "Autobiography", "Biography", "Memoir", "Diary"],
  ["A place where documents are kept", "Archive", "Library", "Museum", "Gallery"], ["Government by the people", "Democracy", "Autocracy", "Theocracy", "Aristocracy"],
);

const TEMPLATES = [...quant, ...logical, ...verbal];

export const generatedTopics: Record<GenCategory, string[]> = {
  quant: [...new Set(quant.map(template => template.topic))],
  logical: [...new Set(logical.map(template => template.topic))],
  verbal: [...new Set(verbal.map(template => template.topic))],
};

const finish = (template: Template, difficulty: GenDifficulty, draft: Draft): GeneratedQuestion | null => {
  const wrong = [...new Set(draft.wrong.filter(value => value && value !== draft.correct))].slice(0, 3);
  if (wrong.length < 3) return null;
  const options = shuffle([draft.correct, ...wrong]);
  return { category: template.category, topic: draft.topic, difficulty, prompt: draft.prompt, options, correctOptionIndex: options.indexOf(draft.correct), explanation: draft.explanation, tags: ["generated", draft.topic] };
};

/**
 * One new question for the category. `topics` limits the topics, `difficulty` picks a level (or a random mix),
 * and `avoid` holds prompts to skip, so the same question is not repeated.
 */
export function generateQuestion(input: { category: GenCategory; topics?: string[]; difficulty: GenDifficulty | "mixed"; avoid?: Set<string> }): GeneratedQuestion | null {
  const topics = input.topics?.length ? input.topics : undefined;
  const pool = TEMPLATES.filter(template => template.category === input.category && (!topics || topics.includes(template.topic)));
  if (!pool.length) return null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const template = pick(pool);
    const wanted: GenDifficulty = input.difficulty === "mixed" ? pick(["easy", "easy", "medium", "medium", "medium", "hard"] as const) : input.difficulty;
    const difficulty = template.difficulties.includes(wanted) ? wanted : pick(template.difficulties);
    const draft = template.build(difficulty);
    if (!draft) continue;
    const question = finish(template, difficulty, draft);
    if (!question || input.avoid?.has(question.prompt)) continue;
    return question;
  }
  return null;
}
