import { Router } from 'express';
import { HttpContext } from './http-context.js';
import expressjwt from 'express-jwt';
import jwksRsa from 'jwks-rsa';
import { Request, Response, NextFunction } from 'express';
import { User } from './user.js';

type ExpressMiddleWare = (request, response, next) => void;
const httpGetSymbol = Symbol("HttpGetSymbol");
const httpPostSymbol = Symbol("HttpPostSymbol");
const httpPatchSymbol = Symbol("HttpPatchSymbol");
const httpDeleteSymbol = Symbol("HttpDeleteSymbol");
const controllerSymbol = Symbol("ControllerSymbol")

export abstract class Controller {
    router = Router();
    constructor(public readonly path?: string) {
        this.#registerAllRoutes();
    }

    get routerPath() {
        let path = "";
        if (this.#options.path) {
            path += "/" + this.#options.path;
        }
        if (this.path) {
            path += "/" + this.path;
        };
        if (path)
            return path.replaceAll("//", "/");
        return "/";
    }

    get httpContext(): HttpContext {
        return HttpContext.current;
    }

    get request(): Request {
        return this.httpContext?.request;
    }

    get response(): Response {
        return this.httpContext?.response;
    }

    get user(): User {
        return this.httpContext?.user;
    }

    static #jwksIssuer: string;
    static #jwksEndPoint: string;
    static #jwtMiddleware: expressjwt.RequestHandler;
    static async #getJwtMiddleware(): Promise<expressjwt.RequestHandler> {
        if (!Controller.#jwtMiddleware) {
            Controller.#jwtMiddleware = expressjwt({
                secret: jwksRsa.expressJwtSecret({
                    cache: true,
                    rateLimit: true,
                    jwksRequestsPerMinute: 5,
                    jwksUri: Controller.#jwksEndPoint
                }),
                audience: this.#jwksIssuer,
                issuer: this.#jwksIssuer,
                algorithms: ['RS256']
            });
        }
        return Controller.#jwtMiddleware;
    }

    get #options(): ControllerOptions { return this[controllerSymbol]; }
    get #httpGetMethodDescriptors(): HttpMethodDescriptor[] { return this[httpGetSymbol]; }
    get #httpPostMethodDescriptors(): HttpMethodDescriptor[] { return this[httpPostSymbol]; }
    get #httpPatchMethodDescriptors(): HttpMethodDescriptor[] { return this[httpPatchSymbol]; }
    get #httpDeleteMethodDescriptors(): HttpMethodDescriptor[] { return this[httpDeleteSymbol]; }

    async #registerAllRoutes() {
        this.#registerRoutes("get", this.#httpGetMethodDescriptors);
        this.#registerRoutes("post", this.#httpPostMethodDescriptors);
        this.#registerRoutes("patch", this.#httpPatchMethodDescriptors);
        this.#registerRoutes("delete", this.#httpDeleteMethodDescriptors);
    }

    async #registerRoutes(routerMethod, descriptors: HttpMethodDescriptor[]) {
        if (descriptors) {
            for (const descriptor of descriptors) {
                this.router[routerMethod](descriptor.path,
                    (request: Request, response: Response, next:NextFunction) => {
                        if (request.headers["authorization"] || (!this.#options.allowAnonymous && !descriptor.options?.allowAnonymous)) {
                            Controller.#getJwtMiddleware().then(jwtHandler => {
                                jwtHandler(request, response, next);
                            });
                        } else {
                            next(null);
                        }
                    },
                    (request: Request, response: Response, next:NextFunction) => {
                        HttpContext.start(request, response, next, request["user"],
                            () => descriptor.propertyDescriptor.value.bind(this)());
                    }
                );
            }
        }
    } // end #registerRoutes

} // end Controller

export interface HttpMethodDescriptor {
    path: string,
    memberName: string,
    propertyDescriptor: PropertyDescriptor;
    options: MethodOptions
}

export interface ControllerOptions {
    path?: string;
    allowAnonymous: boolean;
}

export interface MethodOptions {
    allowAnonymous: boolean;
}

export const httpGet = (path: string, options?: MethodOptions) => httpMethod(httpGetSymbol, path, options);
export const httpPost = (path: string, options?: MethodOptions) => httpMethod(httpPostSymbol, path, options);
export const httpPatch = (path: string, options?: MethodOptions) => httpMethod(httpPatchSymbol, path, options);
export const httpDelete = (path: string, options?: MethodOptions) => httpMethod(httpDeleteSymbol, path, options);

const httpMethod = (symbol, path: string, options?: MethodOptions) => {
    return (target: any, memberName: string, propertyDescriptor: PropertyDescriptor) => {
        if (!target[symbol]) {
            target[symbol] = [];
        }
        const descriptors: HttpMethodDescriptor[] = target[symbol];
        if (!path.startsWith("/")) {
            path = '/' + path;
        }
        descriptors.push({ path, memberName, propertyDescriptor, options });
    }
}

export const controller = (options?: ControllerOptions) => (constructor: Function) => {
    constructor.prototype[controllerSymbol] = options;
};