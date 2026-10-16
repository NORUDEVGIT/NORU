import { useRequestDemo } from "../lib/router";

export function RequestDemoButton() {
  const requestDemo = useRequestDemo();
  return (
    <div className="w" style={{ padding: "24px 20px 64px" }}>
      <a
        className="btn"
        href="#resources/contact"
        onClick={(e) => {
          e.preventDefault();
          requestDemo();
        }}
      >
        Request Demo
      </a>
    </div>
  );
}
