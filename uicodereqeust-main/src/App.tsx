import { AppProviders } from "@/providers/AppProviders";
import { AppRoutes } from "@/routes/AppRoutes";

const App = () => (
  <AppProviders>
    <AppRoutes />
  </AppProviders>
);

export default App;
