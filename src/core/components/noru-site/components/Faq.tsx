import { FAQ } from "../data/content";

export function Faq() {
  return (
    <section>
      <div className="w">
        <h2>Frequently asked questions</h2>
        <div className="faq">
          {FAQ.map((item) => (
            <details key={item.question}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
