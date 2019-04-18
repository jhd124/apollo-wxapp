import { BatchHttpLink } from "apollo-link-batch-http";
import { ApolloLink } from "apollo-link";
import { setContext } from "apollo-link-context";
import { onError } from "apollo-link-error";
import { RetryLink } from "apollo-link-retry";
import { createPersistedQueryLink } from "apollo-link-persisted-queries";
import logger from "apollo-link-logger";
import { ApolloClient } from "apollo-client";
import { InMemoryCache } from "apollo-cache-inmemory";
import _ from "lodash";

let client = null;
export function initGraphql(wepyRequest, version, product, enableLogging) {

    if (client) {
        throw new Error("client already set!!");
    }
    if (!wepyRequest) {
        throw new Error("no request func");
    }
    if (!product) {
        throw new Error("productName is expected");
    }
    if (!version) {
        throw new Error("version is expected");
    }

    const signatureLink = setContext(async () => {
        const headers = generateHeader(product, version);
        return headers;
    });

    const httpLink = new BatchHttpLink({
        uri: SERVER_URL + "/graphql",
        fetch: (url, { body, method, headers }) =>
            wepyRequest({
                url,
                header: headers,
                method,
                data: body,
                dataType: "text",
            }).then(response => ({
                text: () => Promise.resolve(response.data),
            })),
    });

    const errorLogger = onError(({ graphQLErrors, networkError }) => {

        if (graphQLErrors) {
            for (const { message, locations = [], path } of graphQLErrors) {
                console.error([
                    "GraphQL error",
                    `Message: ${message}`,
                    `Location: ${locations.map(location => "\n\t" + JSON.stringify(location))}`,
                    `Path: ${path}`,
                ].join("\n"));
            }
        }
        if (networkError) {
            console.warn(`[Network error]: ${networkError}`);
        }
    });

    const retryLink = new RetryLink({
        delay: {
            max: 4000,
        },
        attempts: (count, op) => {
            const { variables } = op;
            const maxRetry = variables.maxRetry ? variables.maxRetry : 5;
            return count <= maxRetry;
        },
    });

    const links = [
        enableLogging && logger,
        enableLogging && errorLogger,
        // cleanTypenameLink,
        signatureLink,
        createPersistedQueryLink(),
        retryLink,
        httpLink,
    ];

    client = new ApolloClient({
        link: ApolloLink.from(_.compact(links)),
        cache: new InMemoryCache(),
    });

}

export function getClient() {
    if (!client) {
        throw new Error("client not set yet");
    }
    return client;
}

export function sendQuery(query, variables, fetchPolicy) {
    return getClient().query({ query, variables, fetchPolicy });
}
export function sendMutation(mutation, variables, refetchQueries) {
    return getClient().mutate({ mutation, variables, refetchQueries });
}