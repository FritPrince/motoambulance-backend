declare module 'africastalking' {
  function AfricasTalking(config: { apiKey: string; username: string }): {
    SMS: {
      send(options: { to: string[]; message: string; from: string }): Promise<any>
    }
  }
  export = AfricasTalking
}
