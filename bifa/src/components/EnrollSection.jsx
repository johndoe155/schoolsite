import React from 'react';
import { enroll } from '../data/content.js';
import { RevealGroup, RevealItem } from './Reveal.jsx';
import InfoCard from './InfoCard.jsx';

export default function EnrollSection() {
  return (
    <section className="section" id="enroll">
      <div className="container">
        <RevealGroup as="div" className="section-header">
          <RevealItem as="span" className="kicker">
            {enroll.eyebrow}
          </RevealItem>
          <RevealItem as="h2">{enroll.heading}</RevealItem>
          <RevealItem as="p">{enroll.body}</RevealItem>
        </RevealGroup>

        <RevealGroup as="div" className="info-grid" amount={0.15}>
          {enroll.cards.map((card) => (
            <RevealItem as="div" key={card.heading}>
              <InfoCard card={card} />
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}
