import { DkimKey } from "../../DkimKey.js";
import { Acme } from "../../acme.js";
import { Controller, controller, httpGet } from "../shared/controller.js";
import fs from 'fs';

@controller({ allowAnonymous: true })
export class DkimController extends Controller {
    @httpGet("/dkim/create/:domain")
    createForDomain() {
        return DkimKey.create(this.request.params.domain);
    }

    @httpGet("/dkim/create/:domain/:selector")
    createForDomainAndSelector() {
        return DkimKey.create(this.request.params.domain, this.request.params.selector);
    }

    @httpGet("/dkim/list/:domain")
    listSelectorsForDomain(){
        //TODO: Implement
    }

    @httpGet("/dkim/default/:domain")
    listDefaultSelectorForDomain(){
        return DkimKey.getActiveSelector(this.request.params.domain);
    }

    @httpGet("/dkim/dns/:domain/")
    async getDnsInforForDomainDefaultSelector(){
        const selector = await this.listDefaultSelectorForDomain();
        return DkimKey.getDnsForSelector(this.request.params.domain, selector);
    }

    @httpGet("/dkim/dns/:domain/:selector")
    getDnsInforForDomainAndSelector(){
        return DkimKey.getDnsForSelector(this.request.params.domain, this.request.params.selector);
    }


}
