import _ from "lodash";
import { getClient } from "./graphql";
import Type from "./appType";

export function withQuery(qlOptions) {
    const client = getClient();
    const {
        query,
        computeQlData,
        variables,
        debug,
        fetchPolicy,
        pollInterval,
    } = qlOptions;

    const enableDebug = __DEV__ && debug;

    return function (option) {
        const {
            onLoad,
            onUnload,
            created,
            detached,
            didMount,
            didUnmount,
            type,
            data,
        } = option;

        if (!computeQlData) {
            throw new Error("method computeQlData is not found");
        }

        const optionWithQuery = Object.assign({}, option);
        let _query = query;
        let _variables = variables;
        let _qlData = null;
        optionWithQuery.data = {
            loading: true,
            error: false,
            ...data,
        };

        const withQueryFunction = function () {
            const evalSkip = () => {
                // TODO use _.get
                const needVariables = _query && _query.definitions && _query.definitions[0] && _query.definitions[0].variableDefinitions && _query.definitions[0].variableDefinitions[0];
                const shouldSkip = needVariables && !_variables;
                return shouldSkip;
            };

            const watchQuery = () => {

                if (evalSkip()) {
                    return;
                }

                this.queryWatcher = client.watchQuery({
                    query: _query,
                    variables: _variables,
                    fetchPolicy,
                    pollInterval,
                });

                this.querySubscription = this.queryWatcher.subscribe({
                    next: updateResult,
                    error: updateResult,
                });

            };

            const updateQuery = () => {
                if (evalSkip()) {
                    return;
                }

                if (this.queryWatcher) {
                    this.queryWatcher.setOptions({ variables: _variables });
                    updateResult();
                } else {
                    watchQuery();
                }
            };

            const updateResult = () => {
                const debugStyle = "color: #40BBBF;";
                if (enableDebug) {
                    // eslint-disable-next-line no-console
                    console.group("%cupdate result %s", debugStyle + "font-weight: bold", this.is);
                }
                if (!this.queryWatcher) {
                    return;
                }
                const result = this.queryWatcher.currentResult();
                const { data, loading, error } = result;
                // TODO deepClone
                // TODO use data update function
                if (this.data.loading !== loading) {
                    this.setData({ loading });
                    if (enableDebug) {
                        // eslint-disable-next-line no-console
                        console.log("%cloading update: %O", debugStyle, loading);
                    }
                }
                if (!_.isEmpty(error) && !_.isEqual(this.data.error, error)) {
                    this.setData({ error });
                    if (enableDebug) {
                        // eslint-disable-next-line no-console
                        console.log("%cerror update: %O", debugStyle, error);
                    }
                }
                this.qlData = data;
                if (enableDebug) {
                    // eslint-disable-next-line no-console
                    console.log("%cdata update: %O", debugStyle, data);
                }
                // if (!_.isEmpty(data) && !_.isEqual(this.qlData, data)) {
                // }
                if (enableDebug) {
                    // eslint-disable-next-line no-console
                    console.groupEnd();
                }
            };

            this.fetchMore = refetchOptions => {
                if (this.data.fetchMoreLoading || this.data.loading) {
                    return;
                }
                this.setData({ fetchMoreLoading: true });
                return this.queryWatcher.fetchMore(refetchOptions).then(res => {
                    this.setData({ fetchMoreLoading: false });
                    return res;
                }).catch(e => {
                    this.setData({ fetchMoreLoading: false });
                    if (refetchOptions.onError) {
                        refetchOptions.onError(e);
                    }
                });
            };

            this.refetch = () => {
                if (!this.queryWatcher) {
                    return Promise.resolve(null);
                }
                this.queryWatcher.resetLastResults();
                const promise = this.queryWatcher.refetch()
                    .then(updateResult)
                    .catch(updateResult);
                updateResult();
                return promise;
            };
            Object.defineProperties(this, {
                query: {
                    get: function () {
                        return _query;
                    },
                    set: function (value) {
                        _query = value;
                        if (enableDebug) {
                            // eslint-disable-next-line no-console
                            console.log("%cgraphql query setted: %O", "color: #30915C", value);
                        }
                    },
                },
                variables: {
                    get: function () {
                        return _variables;
                    },
                    set: function (value) {
                        if (!_.isEqual(value, _variables)) {
                            _variables = value;
                            updateQuery();
                            // setTimeout(updateQuery, 0);
                            if (enableDebug) {
                                // eslint-disable-next-line no-console
                                console.log("%cgraphql variables setted: %O", "color: #30915C", value);
                            }
                        }
                    },
                },
                qlData: {
                    get: function () {
                        return _qlData;
                    },
                    set: function (data) {
                        _qlData = data;
                        if (enableDebug) {
                            // eslint-disable-next-line no-console
                            console.log("%cgraphql data fetched: %O", "color: #30915C", data);
                        }
                        if (data !== null) {
                            computeQlData.call(this, data);
                        }
                    },
                },
            });

            watchQuery();
        };

        const deWithQueryFunction = function () {
            if (this.querySubscription) {
                this.querySubscription.unsubscribe();
            }
            delete this.querySubscription;
            delete this.queryWatcher;
            this.qlData = null;
            this.variables = null;
            // hack: the property query is not reset, it's risky, but is fine by now
            // this.query = null;
        };

        if (type === Type.WX_COMPONENT) {
            optionWithQuery.created = function () {
                created && created.call(this);
                withQueryFunction.call(this);
            };
            optionWithQuery.detached = function () {
                detached && detached.call(this);
                deWithQueryFunction.call(this);
            };
        } else if (type === Type.WX_PAGE) {
            optionWithQuery.onLoad = function (e) {
                onLoad && onLoad.call(this, e);
                withQueryFunction.call(this);
            };
            optionWithQuery.onUnload = function () {
                onUnload && onUnload.call(this);
                deWithQueryFunction.call(this);
            };
        } else if (type === Type.ALI_COMPONENT) {
            optionWithQuery.didMount = function () {
                didMount && didMount.call(this);
                withQueryFunction.call(this);
            };
            optionWithQuery.didUnmount = function () {
                didUnmount && didUnmount.call(this);
                deWithQueryFunction.call(this);
            };
        } else if (type === Type.ALI_PAGE) {
            optionWithQuery.onLoad = function (e) {
                onLoad && onLoad.call(this, e);
                withQueryFunction.call(this);
            };
            optionWithQuery.onUnload = function () {
                onUnload && onUnload.call(this);
                deWithQueryFunction.call(this);
            };
        } else {
            throw new TypeError("can't recognize the type passed in, which should supposed to be one of wxPage, wxComponent, aliPage, aliComponent");
        }
        return optionWithQuery;
    };
}
/**
 * @description 把fetMore得到的数据跟旧有的数据拼接
 * @param {String} path 数据在服务器返回结果中的路径
 * @returns {Promise} resolve fetchmore 的数据
 */
export function fetchMoreUpdater(path) {
    return (prevResult, { fetchMoreResult }) => {
        if (!fetchMoreResult) {
            return prevResult;
        }
        const rt = _.cloneDeep(prevResult);
        const more = _.get(fetchMoreResult, path, []);
        const prevEntries = _.get(prevResult, path, []);
        const next = prevEntries.concat(more);
        // next = _.uniqBy(next, "id");
        return _.set(rt, path, next);
    };
}
