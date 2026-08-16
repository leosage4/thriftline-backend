import { app } from './app';
import { env } from './config/env';

app.listen(env.port, () => {
  console.log(`ThriftLine backend running at http://localhost:${env.port}`);
});
