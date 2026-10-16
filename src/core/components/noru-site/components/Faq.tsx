import { useNoruSite } from "../site-context";

export function Faq() {
  const { faq } = useNoruSite();
  return (
    <section>
      <div className="w">
        <h2>Frequently asked questions</h2>
        <div className="faq">
          {faq.map((item) => (
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
