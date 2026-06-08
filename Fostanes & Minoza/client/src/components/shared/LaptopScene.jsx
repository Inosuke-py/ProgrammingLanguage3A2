import './LaptopScene.css';

export default function LaptopScene() {
  return (
    <section className="demo-section">
      <div className="demo-section__grid grid-widget" />
      <div className="demo-section__radial radial-widget" />

      <div className="demo-section__header">
        <span className="label">Demo</span>
        <h2>See it in action</h2>
      </div>

      <div className="demo-devices">
        {/* MacBook */}
        <div className="macbook">
          <div className="macbook__bezel">
            <div className="macbook__screen">
              <img
                className="macbook__video"
                src="/laptop_demo.gif"
                alt="Lexara demo"
              />
            </div>
            <div className="macbook__bar" />
          </div>
          <div className="macbook__notch" />
          <div className="macbook__base">
            <div className="macbook__indent" />
          </div>
          <div className="macbook__foot macbook__foot--left" />
          <div className="macbook__foot macbook__foot--right" />
        </div>

        {/* Phone */}
        <div className="phone">
          <div className="phone__frame">
            <img
              className="phone__video"
              src="/mobile_demo.gif"
              alt="Lexara mobile demo"
            />
          </div>
          <div className="phone__header" />
          <div className="phone__sensor" />
          <div className="phone__btn phone__btn--vol" />
          <div className="phone__btn phone__btn--pwr" />
        </div>
      </div>
    </section>
  );
}
