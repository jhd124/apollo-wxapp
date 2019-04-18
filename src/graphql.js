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

function fetch(url, { body, method, headers }) {
    return new Promise((res, rej) => {
        wx.request({
            url,
            data: body,
            method,
            header: headers,
            dataType: "text",
            success: res,
            fail: rej,
        });
    });
}

export function initGraphql({
    requestEndPoint,
    enableLogging,
    headers,
}) {

    if (client) {
        throw new Error("client already set!!");
    }

    const signatureLink = setContext(() => headers);

    const httpLink = new BatchHttpLink({
        uri: requestEndPoint,
        fetch,
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