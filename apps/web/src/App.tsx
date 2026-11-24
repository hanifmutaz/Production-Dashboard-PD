import { Shell } from './shell/Shell';
import { useAuth } from './lib/auth';
import { useRoute } from './lib/router';
import { Executive } from './pages/Executive';
import { Login } from './pages/Login';
import { NotYet } from './pages/NotYet';

export function App() {
  const { me, loading } = useAuth();
  const route = useRoute();
  if (loading) return null;
  if (!me) return <Login />;
  let page;
  switch (route.page) {
    case 'executive':
      page = <Executive key="executive" />;
      break;
    default:
      page = <NotYet name={route.page} />;
  }
  return <Shell route={route}>{page}</Shell>;
}
