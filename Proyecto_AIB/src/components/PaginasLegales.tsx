import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Wordmark } from './ui/Primitives';
import { PiePagina } from './ui/PiePagina';

// ---------------------------------------------------------------------------
// Política de privacidad (/privacidad) y términos de uso (/terminos)
// ---------------------------------------------------------------------------
// Google las pide para verificar la marca de AIB+ en «Continuar con Google».
// Describen lo que la app hace de verdad con los datos: si cambia algo de eso
// (un proveedor nuevo, otro dato que se pide), hay que actualizarlas aquí y
// cambiar la fecha.
// ---------------------------------------------------------------------------

const ACTUALIZADA = '13 de octubre de 2026';
const RESPONSABLE = 'Cordova Solutions';
const CORREO_CONTACTO = 'contacto@aibplus.app';

function PaginaLegal({ titulo, children }: { titulo: string; children: ReactNode }) {
  useEffect(() => {
    const anterior = document.title;
    document.title = `${titulo} · AIB+`;
    window.scrollTo(0, 0);
    // Al volver a la portada sin recargar, que no se quede este título.
    return () => {
      document.title = anterior;
    };
  }, [titulo]);

  return (
    <div className="min-h-screen">
      <header className="cabecera-marca sticky top-0 z-20">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/" aria-label="Ir a la portada de AIB+">
            <Wordmark />
          </Link>
          <Link to="/probar" className="btn btn-primary">
            Pruébalo gratis
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="text-4xl text-balance sm:text-5xl">{titulo}</h1>
        <p className="mt-3 text-sm text-ink-subtle">Última actualización: {ACTUALIZADA}</p>
        <div className="mt-8 space-y-10 leading-relaxed text-ink-muted">{children}</div>
      </main>

      <PiePagina />
    </div>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold text-ink">{titulo}</h2>
      {children}
    </section>
  );
}

function Lista({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-2 pl-5 marker:text-accent">{children}</ul>;
}

const Correo = () => (
  <a href={`mailto:${CORREO_CONTACTO}`} className="font-medium text-accent hover:underline">
    {CORREO_CONTACTO}
  </a>
);

/* -------------------------------------------------------------------------- */

export function Privacidad() {
  return (
    <PaginaLegal titulo="Política de privacidad">
      <p>
        En AIB+ cuidamos los datos que nos confías. Aquí te contamos qué datos usamos, para qué, con quién los
        compartimos y cómo puedes ejercer tus derechos, conforme a la Ley N.° 29733, Ley de Protección de Datos
        Personales del Perú, y su reglamento.
      </p>

      <Seccion titulo="1. Quién es responsable">
        <p>
          AIB+ es una plataforma de {RESPONSABLE}, marca de su titular, persona natural con domicilio en Lima, Perú.
          Para cualquier consulta sobre tus datos, escríbenos a <Correo />.
        </p>
      </Seccion>

      <Seccion titulo="2. Qué es AIB+">
        <p>
          AIB+ conecta a dueños de negocios con ingenieros de software. El dueño del negocio ve gratis cómo quedaría su
          página web, sistema o app, elige a un ingeniero y le envía su encargo. Los ingenieros publican sus diseños y
          atienden esos encargos.
        </p>
      </Seccion>

      <Seccion titulo="3. Qué datos usamos">
        <p className="font-medium text-ink">Si eres dueño de un negocio:</p>
        <Lista>
          <li>
            Lo que nos cuentas de tu proyecto: el nombre y el rubro de tu negocio, a qué se dedica, tus respuestas a las
            preguntas, tus colores, tu logo y las fotos o textos que agregas a tu diseño.
          </li>
          <li>Al enviar tu encargo: tu nombre y tu número de WhatsApp, para que el ingeniero te contacte.</li>
          <li>Los comentarios que dejas en tu diseño y la reseña que escribas sobre tu ingeniero.</li>
          <li>
            Si tu ingeniero te agenda una reunión desde AIB+: el correo de tu cuenta, para que Google Calendar te envíe
            la invitación con el enlace de Google Meet.
          </li>
          <li>
            Si guardas tu proyecto con Google: tu nombre, tu correo y tu foto de perfil de Google. No accedemos a tu
            Gmail, tus contactos ni tus archivos. Si lo guardas con tu correo: tu dirección de correo.
          </li>
        </Lista>
        <p className="font-medium text-ink">Si eres ingeniero:</p>
        <Lista>
          <li>Tu correo y tu contraseña para ingresar. La contraseña se guarda cifrada y nadie de AIB+ puede verla.</li>
          <li>
            Tu perfil público: nombre, foto, presentación, ciudad, servicios, años de experiencia, portafolio y los
            diseños y proyectos que publicas.
          </li>
          <li>
            Tu WhatsApp, que solo ve el administrador de AIB+, y, si activas los avisos, la clave del servicio que te
            los envía.
          </li>
          <li>Tu plan y el registro de sus pagos (monto, fecha y medio). No guardamos datos de tarjetas.</li>
          <li>Tus encargos, propuestas, ingresos registrados y lo que consultas a ABI, tu asistente.</li>
          <li>
            Si conectas tu Google Calendar: tu correo de Google y el permiso para ver tu disponibilidad y crear eventos
            (te lo explicamos en la sección 6).
          </li>
        </Lista>
        <p className="font-medium text-ink">De cualquier visitante:</p>
        <Lista>
          <li>
            Un identificador de sesión que se guarda en tu navegador para que no pierdas tu proyecto. No usamos cookies
            de publicidad ni herramientas de seguimiento de terceros.
          </li>
          <li>
            Estadísticas sin datos personales: cuántas visitas reciben nuestras páginas o la de un ingeniero, por cuál
            entraste y de dónde llegaste (por ejemplo, Google o Instagram), según el enlace o la web que te trajo.
          </li>
          <li>
            Registros técnicos del servidor, como la dirección IP, para mantener la plataforma segura y evitar abusos.
          </li>
        </Lista>
      </Seccion>

      <Seccion titulo="4. Para qué los usamos">
        <Lista>
          <li>Mostrarte cómo quedaría tu proyecto y guardarlo para que puedas volver a él.</li>
          <li>Enviar tu encargo al ingeniero que elijas y que él pueda contactarte y enviarte su propuesta.</li>
          <li>Mostrar los perfiles, diseños y reseñas de los ingenieros en la plataforma.</li>
          <li>Enviar avisos sobre encargos, propuestas y planes.</li>
          <li>Mantener la seguridad, poner límites de uso y mejorar el servicio con estadísticas generales.</li>
        </Lista>
        <p>No vendemos tus datos ni los usamos para publicidad.</p>
      </Seccion>

      <Seccion titulo="5. Con quién los compartimos">
        <Lista>
          <li>
            <strong className="text-ink">Con el ingeniero que elijas</strong> (o el que te invitó): tu proyecto, tus
            respuestas, tu nombre y tu WhatsApp.
          </li>
          <li>
            <strong className="text-ink">En público:</strong> el perfil y los diseños de los ingenieros. Las reseñas
            muestran tu primer nombre y el nombre de tu negocio. Si compartes tu diseño con un enlace, quien lo abra
            podrá verlo y comentarlo.
          </li>
          <li>
            <strong className="text-ink">Con los proveedores que hacen funcionar AIB+</strong>, solo para prestarnos su
            servicio:
            <ul className="mt-2 list-[circle] space-y-1 pl-5">
              <li>Supabase: base de datos, inicio de sesión y archivos.</li>
              <li>Vercel: alojamiento de la web.</li>
              <li>
                Anthropic: inteligencia artificial que arma las vistas previas, los textos y los diseños, y que responde
                a ABI. Recibe la información del proyecto necesaria para cada respuesta.
              </li>
              <li>
                Google: si eliges guardar o ingresar con tu cuenta de Google y, para los ingenieros que lo conectan,
                Google Calendar y Google Meet.
              </li>
              <li>
                CallMeBot: avisos por WhatsApp a los ingenieros. Esos avisos no incluyen el nombre ni el número del
                cliente.
              </li>
              <li>Resend: envío de correos.</li>
              <li>
                Cloudflare: comprobación de que eres una persona y no un programa automático (captcha) al empezar una
                prueba, ingresar o pedir un código. Usa datos técnicos de tu navegador, como la dirección IP.
              </li>
              <li>Google Fonts y jsDelivr: tipografías y estilos de la web.</li>
            </ul>
          </li>
          <li>Con las autoridades, solo cuando la ley lo exija.</li>
        </Lista>
        <p>
          Algunos de estos proveedores procesan los datos fuera del Perú, principalmente en Estados Unidos. Al usar AIB+
          aceptas esta transferencia, que hacemos solo con proveedores que protegen la información.
        </p>
      </Seccion>

      <Seccion titulo="6. Google Calendar de los ingenieros">
        <p>
          Un ingeniero puede conectar su Google Calendar desde los ajustes de ABI, su asistente. Es opcional y lo puede
          desconectar cuando quiera.
        </p>
        <Lista>
          <li>
            <strong className="text-ink">Qué datos de Google usamos:</strong> solo dos permisos. Ver tu disponibilidad
            (los bloques de tiempo libres y ocupados, sin el título ni el contenido de tus eventos) y crear eventos en
            los calendarios que te pertenecen. También tu dirección de correo de Google, para mostrarte qué cuenta
            conectaste.
          </li>
          <li>
            <strong className="text-ink">Para qué:</strong> ABI mira tu disponibilidad para proponerte horarios de
            reunión con tus clientes. Cuando tú lo confirmas con un botón, AIB+ crea la reunión en tu calendario con un
            enlace de Google Meet e invita al correo de tu cliente. No creamos, cambiamos ni borramos nada sin tu
            confirmación, y no leemos tus otros eventos.
          </li>
          <li>
            <strong className="text-ink">Qué guardamos:</strong> el permiso que Google nos da para tu cuenta, cifrado, y
            tu correo de Google. No guardamos tu disponibilidad ni tus eventos: los consultamos en el momento.
          </li>
          <li>
            <strong className="text-ink">Con quién se comparte:</strong> tu disponibilidad se envía al servicio de
            inteligencia artificial que usa ABI (Anthropic) solo para proponerte horarios en esa conversación. Los datos
            de Google no se venden, no se usan para publicidad ni para entrenar modelos de inteligencia artificial, y
            nadie de AIB+ los lee, salvo que tú lo pidas para resolver un problema o que la ley lo exija.
          </li>
          <li>
            <strong className="text-ink">Cómo desconectarlo:</strong> desde los ajustes de ABI o desde la seguridad de
            tu cuenta de Google, en «Apps y servicios de terceros». Al desconectarlo, borramos el permiso guardado.
          </li>
        </Lista>
        <p>
          El uso y la transferencia a cualquier otra aplicación de la información recibida de las API de Google por
          parte de AIB+ se ajustarán a la{' '}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-accent hover:underline"
          >
            Política de Datos del Usuario de los Servicios de API de Google
          </a>
          , incluidos los requisitos de Uso Limitado.
        </p>
        <p className="text-sm italic">
          AIB+&apos;s use and transfer to any other app of information received from Google APIs will adhere to the
          Google API Services User Data Policy, including the Limited Use requirements.
        </p>
      </Seccion>

      <Seccion titulo="7. Cuánto tiempo los guardamos">
        <p>
          Mientras tu proyecto o tu cuenta existan. Las pruebas sin guardar pueden eliminarse después de un tiempo sin
          actividad. Puedes pedirnos en cualquier momento que eliminemos tus datos, salvo los que debamos conservar por
          ley.
        </p>
      </Seccion>

      <Seccion titulo="8. Tus derechos">
        <p>
          Puedes pedir acceder a tus datos, corregirlos, eliminarlos u oponerte a su uso, y retirar tu consentimiento,
          escribiendo a <Correo />. Te responderemos dentro de los plazos que fija la ley. Si no estás conforme con la
          respuesta, puedes acudir a la Autoridad Nacional de Protección de Datos Personales del Ministerio de Justicia
          y Derechos Humanos.
        </p>
      </Seccion>

      <Seccion titulo="9. Seguridad">
        <p>
          La conexión con AIB+ va cifrada y el acceso a los datos está restringido: cada cliente ve solo sus proyectos y
          cada ingeniero, solo sus encargos. Aun así, ningún sistema es infalible: si detectamos un problema que afecte
          tus datos, te avisaremos.
        </p>
      </Seccion>

      <Seccion titulo="10. Menores de edad">
        <p>AIB+ está pensada para mayores de 18 años. No recogemos a sabiendas datos de menores.</p>
      </Seccion>

      <Seccion titulo="11. Cambios">
        <p>
          Si cambiamos esta política, publicaremos la nueva versión aquí con su fecha. Si el cambio es importante, te lo
          haremos saber en la plataforma.
        </p>
      </Seccion>

      <p className="text-sm">
        Consulta también nuestros{' '}
        <Link to="/terminos" className="font-medium text-accent hover:underline">
          términos de uso
        </Link>
        .
      </p>
    </PaginaLegal>
  );
}

/* -------------------------------------------------------------------------- */

export function Terminos() {
  return (
    <PaginaLegal titulo="Términos de uso">
      <p>
        Estos términos regulan el uso de AIB+, la plataforma de {RESPONSABLE} disponible en aibplus.app. Al usarla,
        aceptas estos términos y nuestra{' '}
        <Link to="/privacidad" className="font-medium text-accent hover:underline">
          política de privacidad
        </Link>
        .
      </p>

      <Seccion titulo="1. Qué ofrece AIB+">
        <p>
          AIB+ es un espacio donde los dueños de negocios ven cómo quedaría su proyecto tecnológico (página web, tienda
          online, CRM, ERP, automatización, app u otro) y lo encargan a un ingeniero de software independiente. AIB+
          conecta a ambas partes, pero no desarrolla los proyectos: el servicio lo presta el ingeniero que elijas.
        </p>
      </Seccion>

      <Seccion titulo="2. Para los dueños de negocios">
        <Lista>
          <li>Ver tu proyecto y enviar tu encargo es gratis. AIB+ no te cobra comisión.</li>
          <li>
            Las vistas previas son referenciales: muestran una idea de cómo quedaría. El alcance, el precio, el plazo y
            la forma de pago los acuerdas directamente con tu ingeniero, por ejemplo con la propuesta que te envía.
          </li>
          <li>
            Los pagos del proyecto se hacen directamente entre tú y el ingeniero. AIB+ no recibe ni administra ese
            dinero.
          </li>
          <li>
            Al subir tu logo, tus fotos o tus textos, nos autorizas a usarlos solo para armar tu proyecto y mostrárselo
            al ingeniero que elijas. Siguen siendo tuyos.
          </li>
        </Lista>
      </Seccion>

      <Seccion titulo="3. Para los ingenieros">
        <Lista>
          <li>La información de tu perfil debe ser verdadera y estar al día.</li>
          <li>
            Solo puedes publicar diseños y proyectos que sean tuyos o que tengas derecho a mostrar. Esto incluye los
            diseños que crees con la ayuda de la IA de AIB+.
          </li>
          <li>
            Los precios que publicas («desde S/») son referenciales y los defines tú. Respondes por el servicio que
            prestas a tus clientes.
          </li>
          <li>
            AIB+ se financia con los planes de suscripción de los ingenieros. Sus precios y beneficios se muestran en la
            página de planes y en tu panel; el pago y su registro se coordinan con el administrador de AIB+.
          </li>
        </Lista>
      </Seccion>

      <Seccion titulo="4. Cuentas y acceso">
        <p>
          Puedes probar AIB+ sin crear una cuenta: tu proyecto queda en tu navegador. Para verlo desde otro dispositivo,
          puedes guardarlo con Google o con tu correo. Eres responsable de lo que se haga con tu cuenta; si notas un uso
          que no reconoces, escríbenos.
        </p>
      </Seccion>

      <Seccion titulo="5. Uso aceptable">
        <p>No está permitido:</p>
        <Lista>
          <li>Publicar contenido falso, ilegal, ofensivo o que infrinja derechos de otras personas.</li>
          <li>Hacerse pasar por otra persona o negocio.</li>
          <li>Enviar mensajes no deseados o usar los datos de otros usuarios para fines distintos al encargo.</li>
          <li>Intentar acceder a datos ajenos, vulnerar la seguridad o sobrecargar la plataforma, incluida la IA.</li>
          <li>Escribir reseñas falsas o pedir reseñas a cambio de beneficios.</li>
        </Lista>
        <p>Podemos retirar contenido o suspender cuentas que incumplan estas reglas.</p>
      </Seccion>

      <Seccion titulo="6. Inteligencia artificial">
        <p>
          Algunas funciones usan inteligencia artificial: las vistas previas, los textos, los diseños y ABI. Sus
          resultados pueden contener errores; revísalos antes de usarlos. Para cuidar el servicio, el uso de la IA tiene
          límites diarios.
        </p>
      </Seccion>

      <Seccion titulo="7. Propiedad intelectual">
        <p>
          La marca AIB+, la plataforma y sus diseños base son de {RESPONSABLE}. Los diseños de los ingenieros son de sus
          autores. Tu información y tus contenidos son tuyos.
        </p>
      </Seccion>

      <Seccion titulo="8. Responsabilidad">
        <p>
          Trabajamos para que AIB+ esté disponible y funcione bien, pero se ofrece tal como está y puede tener pausas o
          errores. Los ingenieros son independientes: AIB+ no garantiza el resultado de sus trabajos ni responde por los
          acuerdos que hagan con sus clientes, aunque te ayudaremos a resolver cualquier problema que nos reportes.
        </p>
      </Seccion>

      <Seccion titulo="9. Cambios y ley aplicable">
        <p>
          Podemos actualizar estos términos; publicaremos la nueva versión aquí con su fecha. Se rigen por las leyes del
          Perú, y cualquier controversia se resolverá ante los jueces de Lima.
        </p>
      </Seccion>

      <Seccion titulo="10. Contacto">
        <p>
          Para cualquier consulta, escríbenos a <Correo />.
        </p>
      </Seccion>
    </PaginaLegal>
  );
}
