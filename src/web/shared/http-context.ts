import { AsyncLocalStorage } from 'async_hooks';
import { Request, Response, NextFunction } from 'express';
import { User } from "./user.js";

export class HttpContext {
    private static localStorage = new AsyncLocalStorage();
    public static get current(): HttpContext {
        return HttpContext.localStorage.getStore() as HttpContext;
    }

    private constructor(
        public readonly request: Request,
        public readonly response: Response,
        private readonly next: NextFunction,
        public readonly user: any) { }

    public static async start<T>(request: Request, response: Response, next: NextFunction, user: User, action: () => Promise<T>) {
        const context = new HttpContext(request, response, next, user);
        HttpContext.localStorage.run(context, async () => {
            try {
                const result = await action();
                if (result != undefined) {
                    response.send(result);
                }
            }
            catch (error) {
                if (next) {
                    next(error);
                }
            }
        });
    }
}