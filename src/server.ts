import { app } from './app';

const port = Number(process.env.PORT ?? process.env.port ?? 3000);

app.listen(port, '0.0.0.0', () => {
  console.log(`ThriftLine backend running on port ${port}`);
});
