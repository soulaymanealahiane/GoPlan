import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {OFFER_FIELDS, OFFER_DEFAULTS, calculateOffer, offerPrice, offerSummary} from './dist/university-offer.js';

const read = file => fs.readFileSync(new URL(file, import.meta.url), 'utf8');
const homepage = read('./dist/index.html');
assert.equal(read('./dist/site-home.html'), homepage, 'Both homepage routes use the same controls');
const controls = [...homepage.matchAll(/<div class="offer-stepper">([\s\S]*?)<\/div>/g)];
assert.equal(controls.length, OFFER_FIELDS.length);
for (const [name] of OFFER_FIELDS) {
  const matches = controls.filter(([, markup]) => markup.includes('<input id="offer-' + name + '" name="' + name + '" type="number"'));
  assert.equal(matches.length, 1, 'Exactly one stepper for ' + name);
  const [, markup] = matches[0];
  assert.match(markup, /<button type="button" data-step="-1" aria-label="Decrease [^"]+">−<\/button>/);
  assert.match(markup, /min="0" max="1000" step="1" value="1" required/);
  assert.match(markup, /<button type="button" data-step="1" aria-label="Increase [^"]+">\+<\/button>/);
}

class Element extends EventTarget {
  value = '';
  textContent = '';
  disabled = false;
}

const elements = new Map();
function get(selector) {
  if (!elements.has(selector)) elements.set(selector, new Element());
  return elements.get(selector);
}

const calculator = get('#offer-calculator');
calculator.elements = Object.fromEntries(OFFER_FIELDS.map(([name]) => {
  const input = {
    value: '1',
    min: '0',
    max: '1000',
    get valueAsNumber() { return this.value === '' ? NaN : Number(this.value); },
    set valueAsNumber(number) { this.value = String(number); },
    dispatchEvent(event) {
      assert.ok(event.bubbles, 'Events must reach the calculator form');
      calculator.dispatchEvent(new Event(event.type));
    },
  };
  return [name, input];
}));
const discuss = get('#offer-discuss');
discuss.hasAttribute = name => name === 'data-package-contact';
const dialog = get('#contact-dialog');
dialog.showModal = () => { dialog.open = true; };
const document = {
  querySelector: get,
  querySelectorAll: selector => selector === '[data-contact]' ? [discuss] : [],
};

const script = read('./dist/site.js').replace(/^import .*;\r?\n/gm, '');
vm.runInNewContext(script, {document, OFFER_FIELDS, OFFER_DEFAULTS, calculateOffer, offerPrice, offerSummary, Event});

let changes = 0;
calculator.addEventListener('change', () => changes += 1);
const price = get('#offer-price');
const roadmaps = calculator.elements.roadmaps;
function click(element, target) {
  const event = new Event('click');
  if (target) Object.defineProperty(event, 'target', {value:target});
  element.dispatchEvent(event);
}
function step(amount, input = roadmaps) {
  const button = {
    dataset: {step: String(amount)},
    parentElement: {querySelector: () => input},
  };
  click(calculator, {closest: () => button});
}

assert.equal(price.textContent, 'US$0.44');
step(1);
assert.equal(roadmaps.valueAsNumber, 2);
assert.equal(price.textContent, 'US$0.89');
assert.equal(changes, 1, 'One analytics change event per adjustment');

click(discuss);
assert.ok(dialog.open);
assert.match(get('#contact-package-summary').textContent, /Roadmaps \/ student: 2/);

step(-1);
assert.equal(price.textContent, 'US$0.44');
assert.equal(changes, 2);
step(-1);
assert.equal(roadmaps.valueAsNumber, 0);
assert.equal(price.textContent, 'US$0.00');
step(-1);
assert.equal(roadmaps.valueAsNumber, 0);
assert.equal(changes, 3, 'A press at the lower bound does not count as an adjustment');

roadmaps.value = '1000';
calculator.dispatchEvent(new Event('input'));
step(1);
assert.equal(roadmaps.valueAsNumber, 1000);
assert.equal(changes, 3, 'A press at the upper bound does not count as an adjustment');

roadmaps.value = '';
calculator.dispatchEvent(new Event('input'));
assert.equal(price.textContent, '—');
assert.ok(discuss.disabled);
step(1);
assert.equal(roadmaps.valueAsNumber, 1);
assert.equal(price.textContent, 'US$0.44');
assert.equal(discuss.disabled, false);

const direction = calculator.elements.direction;
step(1, direction);
assert.equal(direction.valueAsNumber, 2);
assert.equal(roadmaps.valueAsNumber, 1);
assert.equal(price.textContent, offerPrice(calculateOffer({...OFFER_DEFAULTS, direction: 2}).price));
click(get('#offer-reset'));
assert.equal(direction.valueAsNumber, 1);
assert.equal(price.textContent, 'US$0.44');

console.log('Passed calculator stepper markup, limits, live pricing, manual entry recovery, reset, analytics and inquiry summary.');
